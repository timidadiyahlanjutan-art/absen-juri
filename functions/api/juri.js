export async function onRequest(context) {
    const { request, env } = context;
    const dbUrl = env.DATABASE_URL;

    if (!dbUrl) {
        return new Response(JSON.stringify({ error: "DATABASE_URL belum dikonfigurasi di Cloudflare!" }), {
            headers: { "Content-Type": "application/json" },
            status: 500
        });
    }

    const cleanDbUrl = dbUrl.trim();
    const parsedUrl = new URL(cleanDbUrl.replace(/^postgres(ql)?:\/\//, 'http://'));
    const host = parsedUrl.hostname;

    async function sql(queryText, params = []) {
        const response = await fetch(`https://${host}/sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Neon-Connection-String': cleanDbUrl
            },
            body: JSON.stringify({ query: queryText, params: params })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || "Gagal mengeksekusi query database");
        }
        return result.rows || [];
    }

    try {
        if (request.method === "GET") {
            const rows = await sql('SELECT id, nama, status, telepon, kode, ruang, absen_masuk, absen_pulang, manual_status FROM juri ORDER BY nama ASC;');
            const formatted = rows.map(r => ({
                id: r.id,
                nama: r.nama,
                status: r.status,
                telepon: r.telepon,
                kode: r.kode || '',
                ruang: r.ruang || '',
                absenMasuk: r.absen_masuk,
                absenPulang: r.absen_pulang,
                manualStatus: r.manual_status
            }));

            return new Response(JSON.stringify(formatted), {
                headers: { "Content-Type": "application/json" }
            });
        }

        if (request.method === "POST") {
            const data = await request.json();
            const juriList = Array.isArray(data) ? data : [data];

            for (const j of juriList) {
                await sql(`
                    INSERT INTO juri (id, nama, status, telepon, kode, ruang, absen_masuk, absen_pulang, manual_status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    ON CONFLICT (id) DO UPDATE SET
                        nama = EXCLUDED.nama,
                        status = EXCLUDED.status,
                        telepon = EXCLUDED.telepon,
                        kode = EXCLUDED.kode,
                        ruang = EXCLUDED.ruang,
                        absen_masuk = EXCLUDED.absen_masuk,
                        absen_pulang = EXCLUDED.absen_pulang,
                        manual_status = EXCLUDED.manual_status;
                `, [
                    String(j.id || ''),
                    j.nama || '',
                    j.status || 'JURI',
                    j.telepon || '-',
                    j.kode || '',
                    j.ruang || '',
                    j.absenMasuk || null,
                    j.absenPulang || null,
                    j.manualStatus || null
                ]);
            }

            return new Response(JSON.stringify({ success: true, status: "success" }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { "Content-Type": "application/json" },
            status: 500
        });
    }
}
