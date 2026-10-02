import { json, leerBody, passwordOk, crearToken } from '../_lib/core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false });
  const { password } = await leerBody(req);
  if (!passwordOk(password)) {
    await new Promise(r => setTimeout(r, 600));
    return json(res, 401, { ok: false, error: 'Clave incorrecta.' });
  }
  json(res, 200, { ok: true, token: crearToken() });
}
