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
            return new Response(JSON.stringify({ success: false, message: "ID wajib diisi!" }), { status: 400 });
        }

        // Query HTTP ke Neon Database
        const response = await fetch(`${dbUrl.replace(/^postgres(ql)?:\/\//, 'https://').split('?')[0]}/sql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: 'SELECT id, nama, status, telepon, kode, ruang, absen_masuk, absen_pulang, manual_status FROM juri WHERE id = $1 LIMIT 1',
                params: [inputId]
            })
        });

        const result = await response.json();
        const user = result.rows && result.rows[0];

        if (!user) {
            return new Response(JSON.stringify({ success: false, message: "ID / Sandi Akses tidak terdaftar!" }), {
                headers: { "Content-Type": "application/json" },
                status: 401
            });
        }

        // Tentukan hak akses role berdasarkan status di database
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
        return new Response(JSON.stringify({ success: false, error: err.message }), { 
            headers: { "Content-Type": "application/json" },
            status: 500 
        });
    }
}
