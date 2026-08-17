export async function onRequest(context) {
    const { request, env } = context;
    const dbUrl = env.DATABASE_URL;

    if (!dbUrl) {
        return new Response(JSON.stringify({ error: "DATABASE_URL not configured" }), { status: 500 });
    }

    const cleanDbUrl = dbUrl.trim();
    const parsedUrl = new URL(cleanDbUrl.replace(/^postgres(ql)?:\/\//, 'http://'));
    const host = parsedUrl.hostname;

    // GET: Ambil seluruh data peserta dari database
    if (request.method === "GET") {
        try {
            const res = await fetch(`https://${host}/sql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Neon-Connection-String': cleanDbUrl
                },
                body: JSON.stringify({
                    query: 'SELECT no, idpps, nama, dom, kelas, guru, ruang_sore, tes, jml_ket_tes, juri_kode, ruang_tes, status, scores FROM peserta ORDER BY no ASC;'
                })
            });
            const result = await res.json();
            const rows = (result.rows || []).map(r => ({
                no: r.no,
                idpps: r.idpps,
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

    // POST: Simpan / Sinkronkan seluruh data peserta ke database
    if (request.method === "POST") {
        try {
            const pesertaList = await request.json();
            if (!Array.isArray(pesertaList) || pesertaList.length === 0) {
                return new Response(JSON.stringify({ success: true }), { status: 200 });
            }

            for (const p of pesertaList) {
                await fetch(`https://${host}/sql`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Neon-Connection-String': cleanDbUrl
                    },
                    body: JSON.stringify({
                        query: `
                            INSERT INTO peserta (no, idpps, nama, dom, kelas, guru, ruang_sore, tes, jml_ket_tes, juri_kode, ruang_tes, status, scores)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
                        `,
                        params: [
                            p.no || 0,
                            String(p.idpps || ''),
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
                        ]
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
