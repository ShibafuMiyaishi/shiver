interface HealthCheckResult {
  name: string;
  ok: boolean;
  message: string;
}

export async function runHealthCheck(): Promise<void> {
  const results: HealthCheckResult[] = [];

  try {
    const res = await fetch("http://localhost:8000/health");
    results.push({
      name: "FastAPI Backend",
      ok: res.ok,
      message: `HTTP ${res.status}`,
    });
  } catch (e) {
    results.push({
      name: "FastAPI Backend",
      ok: false,
      message: `接続失敗: ${e}`,
    });
  }

  try {
    const res = await fetch("http://localhost:8001/health");
    results.push({
      name: "SAM2 GPU Server",
      ok: res.ok,
      message: `HTTP ${res.status}`,
    });
  } catch (e) {
    results.push({
      name: "SAM2 GPU Server",
      ok: false,
      message: `接続失敗: ${e}`,
    });
  }

  try {
    const res = await fetch("http://localhost:7860/sdapi/v1/sd-models");
    results.push({
      name: "SD WebUI",
      ok: res.ok,
      message: res.ok ? "起動中" : `HTTP ${res.status}`,
    });
  } catch (e) {
    results.push({
      name: "SD WebUI",
      ok: false,
      message: `接続失敗（起動してない可能性）: ${e}`,
    });
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());
    results.push({
      name: "Camera/MediaPipe",
      ok: true,
      message: "カメラアクセス OK",
    });
  } catch (e) {
    results.push({
      name: "Camera/MediaPipe",
      ok: false,
      message: `カメラアクセス失敗: ${e}`,
    });
  }

  console.group("=== shiver HealthCheck ===");
  let allOk = true;
  for (const r of results) {
    const icon = r.ok ? "OK" : "NG";
    console.log(`${icon} ${r.name}: ${r.message}`);
    if (!r.ok) allOk = false;
  }
  console.groupEnd();

  if (!allOk) {
    const failed = results
      .filter((r) => !r.ok)
      .map((r) => r.name)
      .join(", ");
    throw new Error(
      `HealthCheck失敗: [${failed}]\n` +
        `上記のサービスを起動してから再実行してください。\n` +
        `次のフェーズへの実装進行は禁止。`,
    );
  }

  console.log("全チェック通過。実装を進めてよい。");
}

// ブラウザコンソールから実行できるようにグローバル登録
(window as unknown as Record<string, unknown>).runHealthCheck = runHealthCheck;
