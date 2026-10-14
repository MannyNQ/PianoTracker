// Thin client for the FastAPI backend (proxied at /api by Vite in dev).

async function request(path, options) {
  let res;
  try {
    res = await fetch(`/api${path}`, options);
  } catch {
    throw new Error('Cannot reach the analysis server. Is the backend running on port 8000?');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `Request failed (${res.status})`);
  return body;
}

export const getHealth = () => request('/health');

export function createJob(video, score) {
  const fd = new FormData();
  fd.append('video', video);
  if (score) fd.append('score', score);
  return request('/jobs', { method: 'POST', body: fd });
}

export const getJob = (id) => request(`/jobs/${id}`);
export const getResult = (id) => request(`/jobs/${id}/result`);

export function rescore(id, { calibration, score, clearScore } = {}) {
  const fd = new FormData();
  if (calibration) fd.append('calibration', JSON.stringify(calibration));
  if (score) fd.append('score', score);
  if (clearScore) fd.append('clear_score', 'true');
  return request(`/jobs/${id}/rescore`, { method: 'POST', body: fd });
}

/** Poll a job until it finishes; calls onStatus with each update. */
export async function waitForJob(id, onStatus, signal) {
  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const st = await getJob(id);
    onStatus(st);
    if (st.status === 'done') return getResult(id);
    if (st.status === 'error') throw new Error(st.error || 'Analysis failed');
    await new Promise((r) => setTimeout(r, 500));
  }
}
