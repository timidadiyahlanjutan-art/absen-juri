// functions/api/peserta.js

export async function onRequest(context) {
    const { request, env } = context;
    const dbUrl = env.DATABASE_URL;

    if (!dbUrl) {
        return jsonResponse({ success: false, message: "DATABASE_URL belum dikonfigurasi di Cloudflare!" }, 500);
    }

    const cleanDbUrl = dbUrl.trim();
    const host = new URL(cleanDbUrl.replace(/^postgres(ql)?:\/\//, 'http://')).hostname;

    // GET: Ambil master data peserta
    if (request.method === "GET") {
        try {
            const res = await fetch(`https://${host}/sql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Neon-Connection-String': cleanDbUrl
                },
                body: JSON.stringify({
                    query: 'SELECT no, idpps, nama, dom, kelas, guru, ruang_sore, tes, jml_ket_tes, juri_kode, ruang_tes, status, scores FROM peserta ORDER BY no ASC, idpps ASC LIMIT 10000;'
                })
            });
            const result = await res.json();
            const rows = (result.rows || []).map(r => ({
                no: r.no,
                idpps: String(r.idpps || '').trim(),
                nama: r.nama,
                dom: r.dom || '-',
                kelas: r.kelas || '-',
                guru: r.guru || '-',
                ruangSore: r.ruang_sore || '-',
                tes: r.tes || '-',
                jmlKetTes: r.jml_ket_tes || 1,
                juriKode: r.juri_kode || '',
                ruangTes: r.ruang_tes || '',
                status: r.status || 'HADIR',
                scores: typeof r.scores === 'string' ? JSON.parse(r.scores) : (r.scores || {})
            }));
            return jsonResponse({ success: true, data: rows });
        } catch (e) {
            return jsonResponse({ success: false, message: e.message }, 500);
        }
    }

    // POST: Ganti 100% Master Data Peserta Baru (Bersihkan data lama di database)
    if (request.method === "POST") {
        try {
            const pesertaList = await request.json();
            if (!Array.isArray(pesertaList) || pesertaList.length === 0) {
                return jsonResponse({ success: true });
            }

            // 1. KOSONGKAN TABEL PESERTA LAMA AGAR TIDAK GABUNG/BENTROK
            await fetch(`https://${host}/sql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Neon-Connection-String': cleanDbUrl
                },
                body: JSON.stringify({ query: 'TRUNCATE TABLE peserta;' })
            });

            // 2. MASUKKAN DATA PESERTA BARU SECARA BERTAHAP
            const chunkSize = 50;
            for (let i = 0; i < pesertaList.length; i += chunkSize) {
                const chunk = pesertaList.slice(i, i + chunkSize);
                const valueClauses = [];
                const params = [];
                let paramIndex = 1;

                chunk.forEach(p => {
                    valueClauses.push(`($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, $${paramIndex+4}, $${paramIndex+5}, $${paramIndex+6}, $${paramIndex+7}, $${paramIndex+8}, $${paramIndex+9}, $${paramIndex+10}, $${paramIndex+11}, $${paramIndex+12}::jsonb)`);
                    params.push(
                        p.no || null,
                        String(p.idpps || '').trim(),
                        p.nama || '',
                        p.dom || '-',
                        p.kelas || '-',
                        p.guru || '-',
                        p.ruangSore || '-',
                        p.tes || '-',
                        p.jmlKetTes || 1,
                        p.juriKode || '',
                        p.ruangTes || '',
                        p.status || 'HADIR',
                        JSON.stringify(p.scores || {})
                    );
                    paramIndex += 13;
                });

                const queryText = `
                    INSERT INTO peserta (no, idpps, nama, dom, kelas, guru, ruang_sore, tes, jml_ket_tes, juri_kode, ruang_tes, status, scores)
                    VALUES ${valueClauses.join(', ')};
                `;

                await fetch(`https://${host}/sql`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Neon-Connection-String': cleanDbUrl
                    },
                    body: JSON.stringify({ query: queryText, params: params })
                });
            }

            return jsonResponse({ success: true });
        } catch (e) {
            return jsonResponse({ success: false, message: e.message }, 500);
        }
    }

    // PUT: Update Skor Kesalahan Satuan (Input Nilai Juri)
    if (request.method === "PUT") {
        try {
            const body = await request.json();
            const { idpps, scores } = body;

            if (!idpps) {
                return jsonResponse({ success: false, message: "IDPPS wajib disertakan" }, 400);
            }

            await fetch(`https://${host}/sql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Neon-Connection-String': cleanDbUrl
                },
                body: JSON.stringify({
                    query: 'UPDATE peserta SET scores = $2::jsonb WHERE idpps = $1;',
                    params: [String(idpps).trim(), JSON.stringify(scores || {})]
                })
            });

            return jsonResponse({ success: true });
        } catch (e) {
            return jsonResponse({ success: false, message: e.message }, 500);
        }
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        }
    });
}
