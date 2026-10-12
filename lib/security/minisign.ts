import crypto from "crypto";

export interface MinisignPublicKey {
  algorithm: string;
  keyId: Buffer;
  keyIdHex: string;
  rawPublicKey: Buffer;
  rawBase64: string;
}

export interface MinisignSignatureRecord {
  algorithm: string;
  keyId: Buffer;
  keyIdHex: string;
  rawSignature: Buffer;
  untrustedComment?: string;
  trustedComment?: string;
  globalSignature?: Buffer;
  fullText: string;
}

export interface MinisignVerificationResult {
  valid: boolean;
  keyIdMatch: boolean;
  error?: string;
}

const ED25519_SPKI_HEADER = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

/**
 * Parses a Minisign public key string (base64 string or multi-line key file).
 * Standard Minisign public key is 42 raw bytes:
 * - 2 bytes signature algorithm: 'Ed' (0x45, 0x64)
 * - 8 bytes key ID (uint64)
 * - 32 bytes Ed25519 raw public key
 */
export function parseMinisignPublicKey(pubKeyStr: string): MinisignPublicKey {
  if (!pubKeyStr || typeof pubKeyStr !== "string") {
    throw new Error("Minisign public key is required");
  }

  let keyText = pubKeyStr.trim();
  // Support base64-wrapped minisign public key files (format used by Tauri CLI in .pub / tauri.conf.json)
  if (!keyText.includes("\n") && !keyText.includes("untrusted comment:") && keyText.length > 60) {
    try {
      const decodedUtf8 = Buffer.from(keyText, "base64").toString("utf8");
      if (decodedUtf8.includes("untrusted comment:") || decodedUtf8.startsWith("RW")) {
        keyText = decodedUtf8;
      }
    } catch {}
  }

  const lines = keyText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let b64 = "";
  for (const line of lines) {
    if (!line.startsWith("untrusted comment:") && !line.startsWith("#")) {
      b64 = line;
      break;
    }
  }

  if (!b64) {
    throw new Error("No valid base64 public key data found");
  }

  const rawBytes = Buffer.from(b64, "base64");
  if (rawBytes.length !== 42) {
    throw new Error(`Invalid Minisign public key length: expected 42 bytes, received ${rawBytes.length} bytes`);
  }

  const algorithm = rawBytes.subarray(0, 2).toString("utf8");
  if (algorithm !== "Ed" && algorithm !== "ED") {
    throw new Error(`Unsupported Minisign algorithm: ${algorithm}`);
  }

  const keyId = rawBytes.subarray(2, 10);
  const rawPublicKey = rawBytes.subarray(10, 42);

  return {
    algorithm,
    keyId,
    keyIdHex: keyId.toString("hex"),
    rawPublicKey,
    rawBase64: b64,
  };
}

/**
 * Parses a Minisign signature string (.sig file contents).
 * Standard Minisign signature consists of:
 * - Line 1: untrusted comment: ...
 * - Line 2: base64(2 bytes alg + 8 bytes key ID + 64 bytes Ed25519 signature) = 74 raw bytes
 * - Line 3: trusted comment: timestamp:...
 * - Line 4: base64(64 bytes global signature over sig + trusted comment)
 */
export function parseMinisignSignature(sigStr: string): MinisignSignatureRecord {
  if (!sigStr || typeof sigStr !== "string") {
    throw new Error("Minisign signature text is required");
  }

  let cleanSig = sigStr.trim();
  if (!cleanSig.includes("\n") && (cleanSig.startsWith("dW50cnVzdGVk") || /^[A-Za-z0-9+/=]+$/.test(cleanSig))) {
    try {
      const decoded = Buffer.from(cleanSig, "base64").toString("utf8");
      if (decoded.includes("untrusted comment:") || decoded.includes("\n")) {
        cleanSig = decoded.trim();
      }
    } catch {}
  }

  const lines = cleanSig
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error("Minisign signature text is empty");
  }

  let untrustedComment: string | undefined;
  let recordB64 = "";
  let trustedComment: string | undefined;
  let globalSigB64: string | undefined;

  let lineIdx = 0;
  if (lines[lineIdx]?.startsWith("untrusted comment:")) {
    untrustedComment = lines[lineIdx];
    lineIdx++;
  }

  if (lineIdx < lines.length) {
    recordB64 = lines[lineIdx];
    lineIdx++;
  }

  if (lineIdx < lines.length && lines[lineIdx]?.startsWith("trusted comment:")) {
    trustedComment = lines[lineIdx];
    lineIdx++;
  }

  if (lineIdx < lines.length) {
    globalSigB64 = lines[lineIdx];
  }

  if (!recordB64) {
    throw new Error("No signature record found in Minisign signature");
  }

  const rawBytes = Buffer.from(recordB64, "base64");
  if (rawBytes.length !== 74) {
    throw new Error(`Invalid Minisign signature record length: expected 74 bytes, received ${rawBytes.length} bytes`);
  }

  const algorithm = rawBytes.subarray(0, 2).toString("utf8");
  if (algorithm !== "Ed" && algorithm !== "ED") {
    throw new Error(`Unsupported Minisign algorithm in signature: ${algorithm}`);
  }
  const keyId = rawBytes.subarray(2, 10);
  const rawSignature = rawBytes.subarray(10, 74);

  let globalSignature: Buffer | undefined;
  if (globalSigB64) {
    const gBytes = Buffer.from(globalSigB64, "base64");
    if (gBytes.length === 64) {
      globalSignature = gBytes;
    }
  }

  return {
    algorithm,
    keyId,
    keyIdHex: keyId.toString("hex"),
    rawSignature,
    untrustedComment,
    trustedComment,
    globalSignature,
    fullText: sigStr.trim(),
  };
}

/**
 * Performs authoritative cryptographic Minisign Ed25519 verification against a binary buffer.
 */
export function verifyMinisignSignature(
  publicKeyStr: string,
  signatureStr: string,
  data: Buffer | Uint8Array
): MinisignVerificationResult {
  try {
    const pub = parseMinisignPublicKey(publicKeyStr);
    const sig = parseMinisignSignature(signatureStr);

    // 1. Key ID consistency check
    if (!pub.keyId.equals(sig.keyId)) {
      return {
        valid: false,
        keyIdMatch: false,
        error: `Key ID mismatch: signature signed by key ID ${sig.keyIdHex}, expected ${pub.keyIdHex}`,
      };
    }

    // 2. Reconstruct standard SPKI DER format for Node.js native crypto import
    const derSpki = Buffer.concat([ED25519_SPKI_HEADER, pub.rawPublicKey]);
    const importedPubKey = crypto.createPublicKey({
      key: derSpki,
      format: "der",
      type: "spki",
    });

    // 3. Authoritatively verify Ed25519 signature over binary bytes (supporting raw and Blake2b-512 prehash)
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    let binaryValid = crypto.verify(null, dataBuffer, importedPubKey, sig.rawSignature);

    if (!binaryValid) {
      try {
        const blakeDigest = crypto.createHash("blake2b512").update(dataBuffer).digest();
        binaryValid = crypto.verify(null, blakeDigest, importedPubKey, sig.rawSignature);
      } catch {}
    }

    if (!binaryValid) {
      return {
        valid: false,
        keyIdMatch: true,
        error: "Cryptographic signature verification failed: binary does not match signature",
      };
    }

    // 4. If trusted comment and global signature exist, verify global signature
    if (sig.trustedComment && sig.globalSignature) {
      const commentText = sig.trustedComment.replace(/^trusted comment:\s*/, "");
      const globalData = Buffer.concat([sig.rawSignature, Buffer.from(commentText, "utf8")]);
      const globalValid = crypto.verify(null, globalData, importedPubKey, sig.globalSignature);
      if (!globalValid) {
        return {
          valid: false,
          keyIdMatch: true,
          error: "Global signature verification over trusted comment failed",
        };
      }
    }

    return {
      valid: true,
      keyIdMatch: true,
    };
  } catch (err: unknown) {
    return {
      valid: false,
      keyIdMatch: false,
      error: err instanceof Error ? err.message : "Unknown Minisign verification error",
    };
  }
}

/**
 * Helper utility to generate a test Minisign keypair and sign payloads.
 * Ideal for automated testing, CI pipelines, and Tauri development setups.
 */
export function generateMinisignKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const rawPub = publicKey.export({ type: "spki", format: "der" }).subarray(12);
  const keyId = crypto.randomBytes(8);
  const sigAlg = Buffer.from([0x45, 0x64]); // 'Ed'

  const pubBytes = Buffer.concat([sigAlg, keyId, rawPub]);
  const pubKeyBase64 = pubBytes.toString("base64");

  return {
    publicKeyBase64: pubKeyBase64,
    keyIdHex: keyId.toString("hex"),
    sign: (data: Buffer | Uint8Array, comment = "signature from gphost test signer") => {
      const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const rawSig = crypto.sign(null, dataBuf, privateKey);
      const sigRecordBytes = Buffer.concat([sigAlg, keyId, rawSig]);
      const sigRecordBase64 = sigRecordBytes.toString("base64");

      const timestamp = Math.floor(Date.now() / 1000);
      const trustedComment = `trusted comment: timestamp:${timestamp}`;
      const globalData = Buffer.concat([rawSig, Buffer.from(trustedComment, "utf8")]);
      const globalSig = crypto.sign(null, globalData, privateKey);

      return [
        `untrusted comment: ${comment}`,
        sigRecordBase64,
        trustedComment,
        globalSig.toString("base64"),
      ].join("\n");
    },
  };
}
