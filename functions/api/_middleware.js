async function verifyJWT(token, secret) {
    try {
        const parts = token.split(".");
        if (parts.length !== 3) return null;

        const [headerB64, payloadB64, sigB64] = parts;
        const dataToSign = `${headerB64}.${payloadB64}`;
        const enc = new TextEncoder();

        const key = await crypto.subtle.importKey(
            "raw",
            enc.encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["verify"]
        );

        // Decode Base64URL
        const binSig = atob(sigB64.replace(/-/g, "+").replace(/_/g, "/"));
        const sigArr = new Uint8Array(binSig.length);
        for (let i = 0; i < binSig.length; i++) sigArr[i] = binSig.charCodeAt(i);

        const isValid = await crypto.subtle.verify("HMAC", key, sigArr, enc.encode(dataToSign));
        if (!isValid) return null;

        const payloadJson = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
        const payload = JSON.parse(payloadJson);

        if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
            return null; // Token kedaluwarsa
        }

        return payload;
    } catch (e) {
        return null;
    }
}

export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // Bypass autentikasi khusus untuk endpoint login
    if (url.pathname === "/api/login") {
        return next();
    }

    const authHeader = request.headers.get("Authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);

    if (!match) {
        return new Response(JSON.stringify({ error: "Unauthorized: Token Bearer tidak ditemukan" }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
        });
    }

    const token = match[1];
    const jwtSecret = env.JWT_SECRET || "default_jwt_secret_ujian_secure_key_2026";
    const decodedUser = await verifyJWT(token, jwtSecret);

    if (!decodedUser) {
        return new Response(JSON.stringify({ error: "Unauthorized: Token tidak valid atau kedaluwarsa" }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
        });
    }

    // Teruskan data user terverifikasi ke context API berikutnya
    context.data = context.data || {};
    context.data.user = decodedUser;

    return next();
}
