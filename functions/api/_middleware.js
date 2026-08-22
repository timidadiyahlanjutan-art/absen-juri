// functions/api/_middleware.js
// Otomatis berjalan SEBELUM semua endpoint di /api/
// kecuali /api/login yang di-whitelist di bawah

const PUBLIC_PATHS = ['/api/login'];

// Decode base64url
function b64urlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

// Verifikasi JWT yang dibuat oleh login.js (generateJWT)
async function verifyJWT(token, secret) {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Format token tidak valid');

    const [headerB64, payloadB64, sigB64] = parts;
    const enc = new TextEncoder();

    // Verifikasi signature
    const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
    );

    const valid = await crypto.subtle.verify(
        'HMAC',
        key,
        b64urlDecode(sigB64),
        enc.encode(`${headerB64}.${payloadB64}`)
    );

    if (!valid) throw new Error('Token tidak valid, akses ditolak');

    // Decode payload — login.js pakai btoa(JSON.stringify(obj))
    // jadi decode-nya: atob lalu JSON.parse
    const payloadJson = atob(
        payloadB64.replace(/-/g, '+').replace(/_/g, '/') +
        '=='.slice(0, (4 - payloadB64.length % 4) % 4)
    );
    const payload = JSON.parse(payloadJson);

    // Cek expired
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
        throw new Error('Sesi habis, silakan login ulang');
    }

    return payload;
}

export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // Lewatkan endpoint publik (login)
    if (PUBLIC_PATHS.includes(url.pathname)) {
        return next();
    }

    // Lewatkan CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            }
        });
    }

    // Ambil token dari header
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return errorResponse('Akses ditolak: token tidak ditemukan', 401);
    }

    const jwtSecret = env.JWT_SECRET;
    if (!jwtSecret) {
        return errorResponse('JWT_SECRET belum dikonfigurasi', 500);
    }

    try {
        const payload = await verifyJWT(token, jwtSecret);

        // Sisipkan data user ke context — bisa dipakai di juri.js & peserta.js
        // dengan context.data.user
        context.data.user = payload;

        return next();
    } catch (err) {
        return errorResponse(err.message, 401);
    }
}

function errorResponse(message, status) {
    return new Response(JSON.stringify({ success: false, message }), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
}
