export async function onRequest(context) {
    const { request, env } = context;
    const dbUrl = env.DATABASE_URL;

    if (!dbUrl) {
        return new Response(JSON.stringify({ error: "DATABASE_URL not configured" }), { status: 500 });
    }

    const cleanDbUrl = dbUrl.trim();
    const parsedUrl = new URL(cleanDbUrl.replace(/^postgres(ql)?:\/\//, 'http://'));
    const host = parsedUrl.hostname;

    // GET: Ambil SELURUH data juri tanpa batas (LIMIT 10000)
    if (request.method === "GET") {
        try {
            const res = await fetch(`https://${host}/sql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Neon-Connection-String': cleanDbUrl
                },
                body: JSON.stringify({
                    query: 'SELECT id, nama, status, telepon, kode, ruang, absen_masuk, absen_pulang, manual_status FROM juri ORDER BY id ASC LIMIT 10000;'
                })
            });
            const result = await res.json();
            const rows = (result.rows || []).map(r => ({
                id: String(r.id || '').trim(),
                nama: r.nama,
                status: r.status || 'JURI',
                telepon: r.telepon || '-',
                kode: r.kode || '',
                ruang: r.ruang || '',
                absenMasuk: r.absen_masuk,
                absenPulang: r.absen_pulang,
                manualStatus: r.manual_status
            }));
            return new Response(JSON.stringify(rows), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    // POST: Simpan seluruh juri secara BATCH (Cepat, stabil & tidak terpotong)
    if (request.method === "POST") {
        try {
            const juriList = await request.json();
            if (!Array.isArray(juriList) || juriList.length === 0) {
                return new Response(JSON.stringify({ success: true }), { status: 200 });
            }

            const chunkSize = 50;
            for (let i = 0; i < juriList.length; i += chunkSize) {
                const chunk = juriList.slice(i, i + chunkSize);
                
                const valueClauses = [];
                const params = [];
                let paramIndex = 1;

                chunk.forEach(j => {
                    valueClauses.push(`($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, $${paramIndex+4}, $${paramIndex+5}, $${paramIndex+6}, $${paramIndex+7}, $${paramIndex+8})`);
                    params.push(
                        String(j.id || '').trim(),
                        j.nama || '',
                        j.status || 'JURI',
                        j.telepon || '-',
                        j.kode || '',
                        j.ruang || '',
                        j.absenMasuk || null,
                        j.absenPulang || null,
                        j.manualStatus || null
                    );
                    paramIndex += 9;
                });

                const queryText = `
                    INSERT INTO juri (id, nama, status, telepon, kode, ruang, absen_masuk, absen_pulang, manual_status)
                    VALUES ${valueClauses.join(', ')}
                    ON CONFLICT (id) DO UPDATE SET
                        nama = EXCLUDED.nama,
                        status = EXCLUDED.status,
                        telepon = EXCLUDED.telepon,
                        kode = EXCLUDED.kode,
                        ruang = EXCLUDED.ruang,
                        absen_masuk = EXCLUDED.absen_masuk,
                        absen_pulang = EXCLUDED.absen_pulang,
                        manual_status = EXCLUDED.manual_status;
                `;

                await fetch(`https://${host}/sql`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Neon-Connection-String': cleanDbUrl
                    },
                    body: JSON.stringify({
                        query: queryText,
                        params: params
                    })
                });
            }

            return new Response(JSON.stringify({ success: true, status: "success" }), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
}
