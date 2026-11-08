// MOOPI Desktop's own updates (0.9.7).
/** The latest release: its version and its .vsix. GitHub's web page of the latest release redirects to the
 *  release's tag, and the file is at a fixed address under it — none of it is GitHub's API, whose 60 requests an
 *  hour for each internet address run out behind a provider that shares one address among many people (user 5's
 *  Desktop got "HTTP 403" from it on 08.11.2026 and stayed on 0.9.5). The API is asked only if the page fails. */
async function latestRelease(repo, get = fetch) {
  const ua = { 'User-Agent': 'moopi-desktop' };
  try {
    const r = await get(`https://github.com/${repo}/releases/latest`, { headers: ua, redirect: 'manual' });
    const where = (r.status >= 300 && r.status < 400 && r.headers.get('location')) || r.url || '';
    const m = /\/releases\/tag\/v?(\d+\.\d+\.\d+)\/?$/.exec(where);
    if (m) return { tag: m[1], url: `https://github.com/${repo}/releases/download/v${m[1]}/moopi.moopi-desktop-${m[1]}.vsix` };
  } catch (e) {}
  const r = await get(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { ...ua, Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const rel = await r.json();
  const tag = String(rel.tag_name || '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(tag)) throw new Error('tag ' + rel.tag_name);
  const asset = (rel.assets || []).find((a) => a.name === `moopi.moopi-desktop-${tag}.vsix`);
  if (!asset) throw new Error('no vsix for ' + tag);
  return { tag, url: asset.browser_download_url };
}

module.exports = { latestRelease };
