export async function onRequest(context) {
    const { request, env } = context;
    const dbUrl = env.DATABASE_URL;

    if (!dbUrl) {
        return new Response(JSON.stringify({ error: "DATABASE_URL not configured" }), { status: 500 });
    }

    const cleanDbUrl = dbUrl.trim();
    const parsedUrl = new URL(cleanDbUrl.replace(/^postgres(ql)?:\/\//, 'http://'));
    const host = parsedUrl.hostname;

    // GET: Ambil SELURUH data peserta tanpa batasan default 50
    if (request.method === "GET") {
        try {
            const res = await fetch(`https://${host}/sql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Neon-Connection-String': cleanDbUrl
                },
                body: JSON.stringify({
                    // Tambahkan LIMIT 10000 agar Neon menarik seluruh data tanpa dipotong
                    query: 'SELECT no, idpps, nama, dom, kelas, guru, ruang_sore, tes, jml_ket_tes, juri_kode, ruang_tes, status, scores FROM peserta ORDER BY no ASC LIMIT 10000;'
                })
            });
            const result = await res.json();
            const rows = (result.rows || []).map(r => ({
                no: r.no,
                idpps: String(r.idpps || '').trim(),
                nama: r.nama,
                dom: r.dom,
                kelas: r.kelas,
                guru: r.guru,
                ruangSore: r.ruang_sore,
                tes: r.tes,
                jmlKetTes: r.jml_ket_tes,
                juriKode: r.juri_kode || '',
                ruangTes: r.ruang_tes || '',
                status: r.status || 'HADIR',
                scores: typeof r.scores === 'string' ? JSON.parse(r.scores) : (r.scores || { k1: {}, k2: {} })
            }));

            return new Response(JSON.stringify(rows), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    // POST: Simpan seluruh data peserta dengan sistem Batch Insert (Cepat & Tidak Terpotong)
    if (request.method === "POST") {
        try {
            const pesertaList = await request.json();
            if (!Array.isArray(pesertaList) || pesertaList.length === 0) {
                return new Response(JSON.stringify({ success: true }), { status: 200 });
            }

            // Pecah data per 50 item per batch query agar pengiriman data besar sangat stabil
            const chunkSize = 50;
            for (let i = 0; i < pesertaList.length; i += chunkSize) {
                const chunk = pesertaList.slice(i, i + chunkSize);
                
                const valueClauses = [];
                const params = [];
                let paramIndex = 1;

                chunk.forEach(p => {
                    valueClauses.push(`($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, $${paramIndex+4}, $${paramIndex+5}, $${paramIndex+6}, $${paramIndex+7}, $${paramIndex+8}, $${paramIndex+9}, $${paramIndex+10}, $${paramIndex+11}, $${paramIndex+12}::jsonb)`);
                    params.push(
                        p.no || 0,
                        String(p.idpps || '').trim(),
                        p.nama || '',
                        p.dom || '',
                        p.kelas || '',
                        p.guru || '',
                        p.ruangSore || '',
                        p.tes || '',
                        p.jmlKetTes || 1,
                        p.juriKode || '',
                        p.ruangTes || '',
                        p.status || 'HADIR',
                        JSON.stringify(p.scores || { k1: {}, k2: {} })
                    );
                    paramIndex += 13;
                });

                const queryText = `
                    INSERT INTO peserta (no, idpps, nama, dom, kelas, guru, ruang_sore, tes, jml_ket_tes, juri_kode, ruang_tes, status, scores)
                    VALUES ${valueClauses.join(', ')}
                    ON CONFLICT (idpps) DO UPDATE SET
                        no = EXCLUDED.no,
                        nama = EXCLUDED.nama,
                        dom = EXCLUDED.dom,
                        kelas = EXCLUDED.kelas,
                        guru = EXCLUDED.guru,
                        ruang_sore = EXCLUDED.ruang_sore,
                        tes = EXCLUDED.tes,
                        jml_ket_tes = EXCLUDED.jml_ket_tes,
                        juri_kode = EXCLUDED.juri_kode,
                        ruang_tes = EXCLUDED.ruang_tes,
                        status = EXCLUDED.status,
                        scores = EXCLUDED.scores;
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

            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
}
