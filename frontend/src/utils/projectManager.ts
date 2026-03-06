import { AvatarPart, AvatarProject, KeyBinding, DEFAULT_KEY_BINDINGS } from "../types/avatar";

const PROJECT_VERSION = "1.0.0";

/**
 * アバタープロジェクトをJSON形式で保存・読み込みする。
 * 保存ファイルには全パーツ画像がbase64 data URLとして含まれる。
 */

export function saveProject(
  name: string,
  parts: AvatarPart[],
  sourceImageB64: string | null,
  keyBindings: KeyBinding[] = DEFAULT_KEY_BINDINGS,
): void {
  const project: AvatarProject = {
    id: crypto.randomUUID(),
    name,
    sourceImageUrl: sourceImageB64
      ? `data:image/png;base64,${sourceImageB64}`
      : "",
    parts,
    keyBindings,
    createdAt: new Date().toISOString(),
  };

  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^a-zA-Z0-9_\-\u3000-\u9fff]/g, "_")}.shiver.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function loadProject(file: File): Promise<AvatarProject> {
  const text = await file.text();
  const project = JSON.parse(text) as AvatarProject;

  if (!project.parts || !Array.isArray(project.parts)) {
    throw new Error("無効なプロジェクトファイルです。partsが見つかりません。");
  }

  if (project.parts.length === 0) {
    throw new Error("プロジェクトにパーツが含まれていません。");
  }

  // keyBindingsがなければデフォルトを使用
  if (!project.keyBindings) {
    project.keyBindings = DEFAULT_KEY_BINDINGS;
  }

  return project;
}
