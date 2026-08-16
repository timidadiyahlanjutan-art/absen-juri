import { Client } from '@neondatabase/serverless';

export async function onRequest(context) {
    const client = new Client(context.env.DATABASE_URL);
    await client.connect();

    const { request } = context;

    try {
        // Ambil Data Peserta & Nilai (GET)
        if (request.method === "GET") {
            const { rows } = await client.query('SELECT * FROM peserta ORDER BY no ASC');
            await client.end();

            const formatted = rows.map(r => ({
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
                status: r.status,
                scores: typeof r.scores === 'string' ? JSON.parse(r.scores) : r.scores
            }));

            return new Response(JSON.stringify(formatted), {
                headers: { "Content-Type": "application/json" }
            });
        }

        // Simpan / Update Peserta & Nilai (POST)
        if (request.method === "POST") {
            const data = await request.json();
            const pesertaList = Array.isArray(data) ? data : [data];

            for (const p of pesertaList) {
                await client.query(`
                    INSERT INTO peserta (idpps, no, nama, dom, kelas, guru, ruang_sore, tes, jml_ket_tes, juri_kode, ruang_tes, status, scores)
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
                `, [
                    p.idpps, p.no, p.nama, p.dom, p.kelas, p.guru, p.ruangSore, 
                    p.tes, p.jmlKetTes, p.juriKode, p.ruangTes, p.status, JSON.stringify(p.scores)
                ]);
            }

            await client.end();
            return new Response(JSON.stringify({ status: "success" }), {
                headers: { "Content-Type": "application/json" }
            });
        }
    } catch (err) {
        await client.end();
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
