// Helper HMAC-SHA256 JWT untuk Cloudflare Workers
async function generateJWT(payload, secret) {
    const header = { alg: "HS256", typ: "JWT" };
    const enc = new TextEncoder();

    const b64Url = (obj) =>
        btoa(JSON.stringify(obj))
            .replace(/=/g, "")
            .replace(/\+/g, "-")
            .replace(/\//g, "_");

    const headerB64 = b64Url(header);
    const payloadB64 = b64Url(payload);
    const dataToSign = `${headerB64}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        enc.encode(dataToSign)
    );

    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

    return `${dataToSign}.${sigB64}`;
}

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    const dbUrl = env.DATABASE_URL;
    const jwtSecret = env.JWT_SECRET || "default_jwt_secret_ujian_secure_key_2026";

    if (!dbUrl) {
        return new Response(JSON.stringify({ error: "DATABASE_URL not configured" }), { status: 500 });
    }

    try {
        const body = await request.json();
        const inputId = String(body.id || "").trim();

        if (!inputId) {
            return new Response(JSON.stringify({ success: false, message: "ID wajib diisi!" }), { status: 400 });
        }

        const cleanDbUrl = dbUrl.trim();
        const parsedUrl = new URL(cleanDbUrl.replace(/^postgres(ql)?:\/\//, "http://"));
        const host = parsedUrl.hostname;

        const res = await fetch(`https://${host}/sql`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Neon-Connection-String": cleanDbUrl
            },
            body: JSON.stringify({
                query: "SELECT id, nama, status, grid, kode, ruang FROM juri WHERE id = $1 LIMIT 1;",
                params: [inputId]
            })
        });

        const result = await res.json();
        const userRow = (result.rows || [])[0];

        if (!userRow) {
            return new Response(JSON.stringify({ success: false, message: "ID tidak ditemukan dalam sistem!" }), { status: 401 });
        }

        const rawStatus = String(userRow.status || "JURI").toUpperCase();
        let role = "juri";
        if (rawStatus === "ADMIN") role = "admin";
        else if (rawStatus === "OPERATOR") role = "operator";

        const userPayload = {
            id: String(userRow.id).trim(),
            nama: userRow.nama,
            role: role,
            grid: userRow.grid || "B",
            kode: userRow.kode || "",
            ruang: userRow.ruang || "",
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 jam
        };

        const token = await generateJWT(userPayload, jwtSecret);

        return new Response(JSON.stringify({
            success: true,
            token: token,
            user: {
                id: userPayload.id,
                nama: userPayload.nama,
                role: userPayload.role,
                grid: userPayload.grid,
                kode: userPayload.kode,
                ruang: userPayload.ruang
            }
        }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (e) {
        return new Response(JSON.stringify({ success: false, message: e.message }), { status: 500 });
    }
}
