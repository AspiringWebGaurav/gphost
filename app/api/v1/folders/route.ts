import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest } from "@/lib/auth/api-keys";
import {
  createFolder,
  updateFolderMetadata,
  listFolderContents,
  getFolderTree,
  renameFolder,
  moveFolder,
  relocateFolder,
  deleteFolder,
  normalizeFolderPath,
} from "@/lib/storage/folders";

export const dynamic = "force-dynamic";

const createFolderSchema = z.object({
  path: z.string().trim().optional(),
  name: z.string().trim().optional(),
  parentPath: z.string().trim().optional().nullable(),
  immutable: z.boolean().optional(),
  isImmutable: z.boolean().optional(),
  purpose: z.string().trim().max(100).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
});

const patchFolderSchema = z.object({
  path: z.string().trim().min(1),
  newName: z.string().trim().min(1).optional(),
  destinationParent: z.string().trim().nullable().optional(),
  newParent: z.string().trim().nullable().optional(),
  parentPath: z.string().trim().nullable().optional(),
  newPath: z.string().trim().optional(),
  immutable: z.boolean().optional(),
  isImmutable: z.boolean().optional(),
  purpose: z.string().trim().max(100).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  force: z.boolean().optional(),
  confirmImmutable: z.boolean().optional(),
});

/**
 * GET /api/v1/folders
 * Lists folders, subfolders, files, and breadcrumbs, or returns the full folder tree.
 */
export async function GET(req: NextRequest) {
  try {
    const authRes = await authenticateRequest(req, "files:read");
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId } = authRes.auth;

    const { searchParams } = new URL(req.url);
    const isTree = searchParams.get("tree") === "true";
    const rawPath = searchParams.get("path") || searchParams.get("parentPath") || "";
    const recursive = searchParams.get("recursive") === "true";

    if (isTree) {
      const tree = await getFolderTree(userId);
      return NextResponse.json({
        success: true,
        tree,
      });
    }

    let normalizedPath = "";
    try {
      normalizedPath = normalizeFolderPath(rawPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid folder path";
      return NextResponse.json({ error: msg, code: "INVALID_PATH" }, { status: 400 });
    }

    const contents = await listFolderContents(userId, normalizedPath, { recursive });

    return NextResponse.json({
      success: true,
      ...contents,
    });
  } catch (err: unknown) {
    console.error("[v1 Folders GET] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/v1/folders
 * Creates a custom folder (and any intermediate ancestor parent folders).
 */
export async function POST(req: NextRequest) {
  try {
    const authRes = await authenticateRequest(req, "files:upload");
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId } = authRes.auth;

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }

    const parseResult = createFolderSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid folder parameters", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const {
      path: rawPath,
      name,
      parentPath,
      immutable,
      isImmutable,
      purpose,
      description,
    } = parseResult.data;

    let fullPath = "";
    if (rawPath) {
      fullPath = rawPath;
    } else if (name) {
      fullPath = parentPath ? `${parentPath}/${name}` : name;
    } else {
      return NextResponse.json(
        { error: "Must specify either 'path' or 'name'" },
        { status: 400 }
      );
    }

    let normalized = "";
    try {
      normalized = normalizeFolderPath(fullPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid folder path format";
      return NextResponse.json({ error: msg, code: "INVALID_PATH" }, { status: 400 });
    }

    if (!normalized) {
      return NextResponse.json(
        { error: "Folder path cannot be empty or root" },
        { status: 400 }
      );
    }

    const folder = await createFolder(userId, normalized, {
      isImmutable: isImmutable ?? immutable,
      purpose,
      description,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Folder '${normalized}' created successfully`,
        folder,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error("[v1 Folders POST] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PATCH /api/v1/folders
 * Renames or moves a custom folder hierarchy.
 */
export async function PATCH(req: NextRequest) {
  try {
    const authRes = await authenticateRequest(req, "files:manage");
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId } = authRes.auth;

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }

    const parseResult = patchFolderSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid patch parameters", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const {
      path: rawPath,
      newName,
      destinationParent,
      newParent,
      parentPath,
      newPath: explicitNewPath,
      immutable,
      isImmutable,
      purpose,
      description,
      force,
      confirmImmutable,
    } = parseResult.data;

    const isForce = Boolean(force || confirmImmutable);
    const hasMetadataUpdate =
      immutable !== undefined || isImmutable !== undefined || purpose !== undefined || description !== undefined;
    const targetImmutable = isImmutable !== undefined ? isImmutable : immutable;

    let currentNorm = "";
    try {
      currentNorm = normalizeFolderPath(rawPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid source folder path";
      return NextResponse.json({ error: msg, code: "INVALID_PATH" }, { status: 400 });
    }

    if (!currentNorm) {
      return NextResponse.json({ error: "Cannot rename or move root folder" }, { status: 400 });
    }

    // 1. If metadata updates are requested
    let updatedMetadataFolder = null;
    if (hasMetadataUpdate) {
      updatedMetadataFolder = await updateFolderMetadata(userId, currentNorm, {
        isImmutable: targetImmutable,
        purpose,
        description,
      });
    }

    // 2. Rename operation (keeping parent)
    if (newName) {
      const result = await renameFolder(userId, currentNorm, newName, { force: isForce });
      return NextResponse.json({
        success: true,
        message: `Folder renamed from '${result.oldPath}' to '${result.newPath}'`,
        ...result,
        folder: updatedMetadataFolder,
      });
    }

    // 3. Move operation (changing parent)
    const targetParent =
      destinationParent !== undefined
        ? destinationParent
        : newParent !== undefined
        ? newParent
        : parentPath !== undefined
        ? parentPath
        : undefined;

    if (targetParent !== undefined) {
      const cleanParent =
        targetParent && targetParent !== "root" && targetParent !== "/"
          ? targetParent
          : null;
      const result = await moveFolder(userId, currentNorm, cleanParent, { force: isForce });
      return NextResponse.json({
        success: true,
        message: `Folder moved from '${result.oldPath}' to '${result.newPath}'`,
        ...result,
        folder: updatedMetadataFolder,
      });
    }

    // 4. Explicit new path
    if (explicitNewPath) {
      const targetNorm = normalizeFolderPath(explicitNewPath);
      const result = await relocateFolder(userId, currentNorm, targetNorm, { force: isForce });
      return NextResponse.json({
        success: true,
        message: `Folder updated from '${result.oldPath}' to '${result.newPath}'`,
        ...result,
        folder: updatedMetadataFolder,
      });
    }

    // 5. Standalone metadata update (e.g. setting immutable: true / false, purpose, description)
    if (hasMetadataUpdate) {
      return NextResponse.json({
        success: true,
        message: `Folder '${currentNorm}' settings updated successfully`,
        folder: updatedMetadataFolder,
      });
    }

    return NextResponse.json(
      { error: "Must specify 'newName', 'destinationParent', 'newPath', or folder settings ('immutable' / 'purpose')" },
      { status: 400 }
    );
  } catch (err: unknown) {
    const customErr = err as { code?: string; status?: number; message?: string };
    if (customErr.code === "FOLDER_IMMUTABLE") {
      return NextResponse.json(
        { error: customErr.message, code: "FOLDER_IMMUTABLE" },
        { status: 409 }
      );
    }
    if (customErr.code === "RELEASE_LOCKED" || customErr.code === "BASE_INSTALLER_PROTECTED") {
      return NextResponse.json(
        { error: customErr.message, code: customErr.code },
        { status: 409 }
      );
    }
    console.error("[v1 Folders PATCH] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/folders
 * Safely deletes a folder, all its subfolders, and associated files.
 * Reclaims storage quota and enforces Base v0.0.0 permanence protections.
 */
export async function DELETE(req: NextRequest) {
  try {
    const authRes = await authenticateRequest(req, "files:delete");
    if ("errorResponse" in authRes) return authRes.errorResponse;
    const { userId } = authRes.auth;

    const { searchParams } = new URL(req.url);
    let targetPath = searchParams.get("path") || "";
    let recursive = searchParams.get("recursive") !== "false";
    let isForce = searchParams.get("force") === "true" || searchParams.get("confirmImmutable") === "true";

    if (req.headers.get("content-type")?.includes("application/json")) {
      try {
        const body = await req.json();
        if (body?.path && !targetPath) targetPath = body.path;
        if (body?.recursive !== undefined) recursive = Boolean(body.recursive);
        if (body?.force === true || body?.confirmImmutable === true) isForce = true;
      } catch {}
    }

    let normalized = "";
    try {
      normalized = normalizeFolderPath(targetPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid folder path";
      return NextResponse.json({ error: msg, code: "INVALID_PATH" }, { status: 400 });
    }

    if (!normalized) {
      return NextResponse.json(
        { error: "Cannot delete root storage folder" },
        { status: 400 }
      );
    }

    const result = await deleteFolder(userId, normalized, recursive, { force: isForce });

    return NextResponse.json({
      success: true,
      message: `Folder '${normalized}' and its contents deleted successfully`,
      deletedPath: normalized,
      ...result,
    });
  } catch (err: unknown) {
    const customErr = err as { code?: string; status?: number; message?: string };
    if (customErr.code === "FOLDER_IMMUTABLE") {
      return NextResponse.json(
        { error: customErr.message, code: "FOLDER_IMMUTABLE" },
        { status: 409 }
      );
    }
    if (customErr.code === "RELEASE_LOCKED" || customErr.code === "BASE_INSTALLER_PROTECTED") {
      return NextResponse.json(
        { error: customErr.message, code: customErr.code },
        { status: 409 }
      );
    }
    console.error("[v1 Folders DELETE] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
