/* medladder-pages Worker: static assets + POST /api/upload-image.
 *
 * Only /api/upload-image reaches this code (assets.run_worker_first in
 * wrangler.jsonc); every other path is served directly from dist/ without
 * invoking the Worker, so _redirects, _headers, html_handling and the 404
 * page are untouched.
 *
 * The upload route: verifies the caller is a MedLadder admin via their
 * Supabase session token (mock_is_admin RPC), then stores the image in the
 * medladder-images R2 bucket and returns its public URL. The admin panel
 * appends that URL to the question / explanation as an <img> tag before
 * calling admin_add_bank_question.
 */

var SUPABASE_URL = 'https://groeibwykzrliphzzruk.supabase.co';
/* Publishable key — already shipped in app.js / admin-mock.js. */
var SUPABASE_ANON_KEY = 'sb_publishable_tXvgKaWrUfWlpy8SB3c1mQ_ZMrHxzVY';
var R2_PUBLIC_BASE = 'https://pub-5e62ac2b4d1c43fcb7fb6b025a52e189.r2.dev';
var MAX_BYTES = 8 * 1024 * 1024;

var EXT_BY_TYPE = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif'
};

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: { 'content-type': 'application/json' }
  });
}

export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/api/upload-image') {
      return json(404, { ok: false, error: 'not_found' });
    }

    /* Admin check: the caller's Supabase session token must belong to an
       admin. mock_is_admin() is granted to `authenticated` only, so an
       invalid token fails here (401) and a non-admin gets false (403). */
    var auth = request.headers.get('authorization') || '';
    var token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { ok: false, error: 'unauthorized' });
    try {
      var rpc = await fetch(SUPABASE_URL + '/rest/v1/rpc/mock_is_admin', {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: '{}'
      });
      if (!rpc.ok) return json(401, { ok: false, error: 'unauthorized' });
      var isAdmin = await rpc.json();
      if (isAdmin !== true) return json(403, { ok: false, error: 'forbidden' });
    } catch (e) {
      return json(502, { ok: false, error: 'auth_check_failed' });
    }

    /* Parse the uploaded file. */
    var form;
    try {
      form = await request.formData();
    } catch (e) {
      return json(400, { ok: false, error: 'bad_form' });
    }
    var file = form.get('image');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return json(400, { ok: false, error: 'no_image' });
    }
    var ext = EXT_BY_TYPE[file.type];
    if (!ext) return json(400, { ok: false, error: 'not_an_image' });
    if (file.size > MAX_BYTES) return json(400, { ok: false, error: 'too_large' });

    var key = 'generated/admin-q-' + Date.now().toString(36) + '-' +
      crypto.randomUUID().slice(0, 8) + '.' + ext;
    try {
      await env.IMAGES_BUCKET.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type }
      });
    } catch (e) {
      return json(502, { ok: false, error: 'r2_put_failed' });
    }
    return json(200, { ok: true, key: key, url: R2_PUBLIC_BASE + '/' + key });
  }
};
