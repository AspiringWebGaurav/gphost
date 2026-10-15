import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest } from "@/lib/auth/api-keys";
import {
  createFolder,
  listFolderContents,
  getFolderTree,
  renameFolder,
  moveFolder,
  deleteFolder,
  normalizeFolderPath,
} from "@/lib/storage/folders";

export const dynamic = "force-dynamic";

const createFolderSchema = z.object({
  path: z.string().trim().optional(),
  name: z.string().trim().optional(),
  parentPath: z.string().trim().optional().nullable(),
});

const patchFolderSchema = z.object({
  path: z.string().trim().min(1),
  newName: z.string().trim().min(1).optional(),
  destinationParent: z.string().trim().nullable().optional(),
  newPath: z.string().trim().optional(),
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

    const { path: rawPath, name, parentPath } = parseResult.data;

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

    const folder = await createFolder(userId, normalized);

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

    const { path: rawPath, newName, destinationParent, newPath: explicitNewPath } = parseResult.data;

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

    // 1. Rename operation
    if (newName) {
      const result = await renameFolder(userId, currentNorm, newName);
      return NextResponse.json({
        success: true,
        message: `Folder renamed from '${result.oldPath}' to '${result.newPath}'`,
        ...result,
      });
    }

    // 2. Move operation
    if (destinationParent !== undefined) {
      const result = await moveFolder(userId, currentNorm, destinationParent);
      return NextResponse.json({
        success: true,
        message: `Folder moved from '${result.oldPath}' to '${result.newPath}'`,
        ...result,
      });
    }

    // 3. Explicit new path
    if (explicitNewPath) {
      const targetNorm = normalizeFolderPath(explicitNewPath);
      const parent = targetNorm.includes("/") ? targetNorm.substring(0, targetNorm.lastIndexOf("/")) : null;
      const targetName = targetNorm.split("/").pop() || "";
      const result = await renameFolder(userId, currentNorm, targetName);
      return NextResponse.json({
        success: true,
        message: `Folder updated from '${result.oldPath}' to '${result.newPath}'`,
        ...result,
      });
    }

    return NextResponse.json(
      { error: "Must specify 'newName', 'destinationParent', or 'newPath'" },
      { status: 400 }
    );
  } catch (err: unknown) {
    const customErr = err as { code?: string; status?: number; message?: string };
    if (customErr.code === "BASE_INSTALLER_PROTECTED") {
      return NextResponse.json(
        { error: customErr.message, code: "BASE_INSTALLER_PROTECTED" },
        { status: 403 }
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

    if (!targetPath && req.headers.get("content-type")?.includes("application/json")) {
      try {
        const body = await req.json();
        if (body?.path) targetPath = body.path;
        if (body?.recursive !== undefined) recursive = Boolean(body.recursive);
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

    const result = await deleteFolder(userId, normalized, recursive);

    return NextResponse.json({
      success: true,
      message: `Folder '${normalized}' and its contents deleted successfully`,
      deletedPath: normalized,
      ...result,
    });
  } catch (err: unknown) {
    const customErr = err as { code?: string; status?: number; message?: string };
    if (customErr.code === "BASE_INSTALLER_PROTECTED") {
      return NextResponse.json(
        { error: customErr.message, code: "BASE_INSTALLER_PROTECTED" },
        { status: 403 }
      );
    }
    console.error("[v1 Folders DELETE] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
