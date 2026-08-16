export async function onRequest(context) {
    const { request, env } = context;
    const dbUrl = env.DATABASE_URL;

    if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    try {
        const { id } = await request.json();
        const inputId = String(id || '').trim();

        if (!inputId) {
            return new Response(JSON.stringify({ success: false, message: "ID wajib diisi!" }), {
                headers: { "Content-Type": "application/json" },
                status: 400
            });
        }

        if (!dbUrl) {
            return new Response(JSON.stringify({ success: false, message: "DATABASE_URL belum dikonfigurasi di Cloudflare!" }), {
                headers: { "Content-Type": "application/json" },
                status: 500
            });
        }

        // Parsing alamat dan sandi dari DATABASE_URL Neon
        const parsedUrl = new URL(dbUrl.replace(/^postgres(ql)?:\/\//, 'http://'));
        const host = parsedUrl.hostname;
        const password = decodeURIComponent(parsedUrl.password);

        // Query ke Neon SQL API
        const response = await fetch(`https://${host}/sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${password}`
            },
            body: JSON.stringify({
                query: 'SELECT id, nama, status, telepon, kode, ruang, absen_masuk, absen_pulang, manual_status FROM juri WHERE id = $1 LIMIT 1',
                params: [inputId]
            })
        });

        const result = await response.json();

        if (!response.ok || !result.rows) {
            return new Response(JSON.stringify({ 
                success: false, 
                message: result.message || "Gagal membaca database!",
                detail: result 
            }), {
                headers: { "Content-Type": "application/json" },
                status: 500
            });
        }

        const user = result.rows[0];

        if (!user) {
            return new Response(JSON.stringify({ success: false, message: "ID / Sandi Akses tidak terdaftar!" }), {
                headers: { "Content-Type": "application/json" },
                status: 401
            });
        }

        let role = 'juri';
        const st = String(user.status || '').toUpperCase();
        if (st === 'ADMIN') role = 'admin';
        else if (st === 'OPERATOR') role = 'operator';

        return new Response(JSON.stringify({
            success: true,
            user: {
                id: user.id,
                nama: user.nama,
                role: role,
                status: user.status,
                telepon: user.telepon,
                kode: user.kode || '',
                ruang: user.ruang || '',
                absenMasuk: user.absen_masuk,
                absenPulang: user.absen_pulang,
                manualStatus: user.manual_status
            }
        }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, message: err.message }), { 
            headers: { "Content-Type": "application/json" },
            status: 500 
        });
    }
}
