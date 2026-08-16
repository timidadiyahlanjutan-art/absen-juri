export async function onRequest(context) {
    const { request, env } = context;
    const dbUrl = env.DATABASE_URL;

    async function sql(queryText, params = []) {
        const response = await fetch(`${dbUrl.replace(/^postgres(ql)?:\/\//, 'https://').split('?')[0]}/sql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: queryText, params: params })
        });
        const result = await response.json();
        return result.rows || [];
    }

    try {
        if (request.method === "GET") {
            const rows = await sql('SELECT * FROM juri');
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
                `, [j.id, j.nama, j.status, j.telepon, j.kode, j.ruang, j.absenMasuk, j.absenPulang, j.manualStatus]);
            }

            return new Response(JSON.stringify({ status: "success" }), {
                headers: { "Content-Type": "application/json" }
            });
        }
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
