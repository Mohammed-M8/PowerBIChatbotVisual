const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

let REPORT_PATH         = "";
let SEMANTIC_MODEL_PATH = "";
let PAGES_PATH          = "";
let TABLES_PATH         = "";
const PORT              = 3001;

app.post('/config', (req, res) => {
    try {
        const { reportPath } = req.body;
        if (!reportPath) return res.status(400).json({ error: "reportPath required" });

        const derivedModel = reportPath.replace(/\.Report$/, ".SemanticModel");

        if (!fs.existsSync(reportPath)) {
            return res.status(400).json({ success: false, error: "Report path not found: " + reportPath });
        }
        if (!fs.existsSync(derivedModel)) {
            return res.status(400).json({ success: false, error: "SemanticModel not found: " + derivedModel });
        }

        REPORT_PATH         = reportPath;
        SEMANTIC_MODEL_PATH = derivedModel;
        PAGES_PATH          = path.join(REPORT_PATH, "definition", "pages");
        TABLES_PATH         = path.join(SEMANTIC_MODEL_PATH, "definition", "tables");

        console.log("\n🔄 Paths updated:");
        console.log("   Report:        " + REPORT_PATH);
        console.log("   SemanticModel: " + SEMANTIC_MODEL_PATH);

        res.json({ success: true, reportPath: REPORT_PATH, semanticModelPath: SEMANTIC_MODEL_PATH });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function generateId() {
    return [...Array(20)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

function readJsonFile(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

let persistedState = { provider: "gemini", apiKey: "", chatHtml: "" };

app.get('/state', (req, res) => {
    res.json({ state: persistedState });
});

app.post('/state', (req, res) => {
    const { provider, apiKey, chatHtml } = req.body;
    if (provider !== undefined) persistedState.provider = provider;
    if (apiKey  !== undefined) persistedState.apiKey   = apiKey;
    if (chatHtml !== undefined) persistedState.chatHtml = chatHtml;
    res.json({ success: true });
});

app.get('/repair-pages', (req, res) => {
    try {
        const pagesJsonPath = path.join(PAGES_PATH, 'pages.json');
        if (!fs.existsSync(pagesJsonPath)) return res.json({ success: true, message: 'No pages.json found' });
        const pagesJson = readJsonFile(pagesJsonPath);
        if (!pagesJson?.pageOrder) return res.json({ success: true, message: 'Nothing to fix' });
        const before = JSON.stringify(pagesJson.pageOrder);
        pagesJson.pageOrder = pagesJson.pageOrder.map((e) => typeof e === 'string' ? e : e.name).filter(Boolean);
        fs.writeFileSync(pagesJsonPath, JSON.stringify(pagesJson, null, 2), 'utf8');
        res.json({ success: true, before, after: JSON.stringify(pagesJson.pageOrder) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/discover', (req, res) => {
    try {
        const os = require('os');
        const homeDir = os.homedir();
        const searchDirs = [
            path.join(homeDir, 'Desktop'),
            path.join(homeDir, 'Documents'),
            path.join(homeDir, 'Downloads'),
            path.join(homeDir, 'OneDrive', 'Desktop'),
            path.join(homeDir, 'OneDrive', 'Documents'),
        ];

        const found = [];

        const scanDir = (dir, depth = 0) => {
            if (depth > 3) return;
            if (!fs.existsSync(dir)) return;
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                entries.forEach(entry => {
                    if (entry.isFile() && entry.name.endsWith('.pbip')) {
                        const pbipPath = path.join(dir, entry.name);
                        const reportFolder = pbipPath.replace('.pbip', '.Report');
                        const modelFolder  = pbipPath.replace('.pbip', '.SemanticModel');
                        if (fs.existsSync(reportFolder) && fs.existsSync(modelFolder)) {
                            found.push({
                                name: entry.name.replace('.pbip', ''),
                                pbipPath,
                                reportPath: reportFolder,
                                semanticModelPath: modelFolder
                            });
                        }
                    } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        scanDir(path.join(dir, entry.name), depth + 1);
                    }
                });
            } catch {}
        };

        searchDirs.forEach(d => scanDir(d));

        res.json({ success: true, projects: found });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/schema', (req, res) => {
    try {
        const schema = {};

        if (!fs.existsSync(TABLES_PATH)) {
            return res.status(404).json({ error: 'SemanticModel tables folder not found', path: TABLES_PATH });
        }

        const entries = fs.readdirSync(TABLES_PATH, { withFileTypes: true });

        const tmdlFiles = entries.filter(e => e.isFile() && e.name.endsWith('.tmdl'));
        const tmdlFolders = entries.filter(e => e.isDirectory());

        const parseTableContent = (tableName, fileContent) => {
            if (!schema[tableName]) schema[tableName] = { columns: [], measures: [] };

            const colMatches = fileContent.matchAll(/^\s*column\s+'?([^'\n\r]+?)'?\s*$/gm);
            for (const match of colMatches) {
                const col = match[1].trim();
                if (col && !schema[tableName].columns.includes(col)) {
                    schema[tableName].columns.push(col);
                }
            }

            const measureMatches = fileContent.matchAll(/^\s*measure\s+'?([^'\n\r=]+?)'?\s*=/gm);
            for (const match of measureMatches) {
                const m = match[1].trim();
                if (m && !schema[tableName].measures.includes(m)) {
                    schema[tableName].measures.push(m);
                }
            }
        };

        tmdlFiles.forEach(f => {
            const tableName = f.name.replace('.tmdl', '');
            const fileContent = fs.readFileSync(path.join(TABLES_PATH, f.name), 'utf8');
            parseTableContent(tableName, fileContent);
        });

        tmdlFolders.forEach(d => {
            const tablePath = path.join(TABLES_PATH, d.name);
            const tmdlFile = path.join(tablePath, 'table.tmdl');
            if (fs.existsSync(tmdlFile)) {
                const fileContent = fs.readFileSync(tmdlFile, 'utf8');
                parseTableContent(d.name, fileContent);
            }

            const measuresPath = path.join(tablePath, 'measures');
            if (fs.existsSync(measuresPath)) {
                fs.readdirSync(measuresPath)
                    .filter(f => f.endsWith('.tmdl'))
                    .forEach(mf => {
                        const measureName = mf.replace('.measure.tmdl', '').replace('.tmdl', '');
                        if (!schema[d.name]) schema[d.name] = { columns: [], measures: [] };
                        if (!schema[d.name].measures.includes(measureName)) {
                            schema[d.name].measures.push(measureName);
                        }
                    });
            }
        });

        const cleanSchema = {};
        Object.keys(schema).forEach(k => {
            if (!k.startsWith('DateTableTemplate_') && !k.startsWith('LocalDateTable_')) {
                cleanSchema[k] = schema[k];
            }
        });

        res.json({ success: true, schema: cleanSchema });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/pages', (req, res) => {
    try {
        if (!fs.existsSync(PAGES_PATH)) {
            return res.status(404).json({ error: 'Pages folder not found', path: PAGES_PATH });
        }

        const pageFolders = fs.readdirSync(PAGES_PATH, { withFileTypes: true })
            .filter(d => d.isDirectory());

        let order = [];
        const pagesJsonPath = path.join(PAGES_PATH, 'pages.json');
        if (fs.existsSync(pagesJsonPath)) {
            const pagesJson = readJsonFile(pagesJsonPath);
            order = pagesJson?.pageOrder ?? [];
        }

        let pages = pageFolders.map(d => {
            const pageJson = readJsonFile(path.join(PAGES_PATH, d.name, 'page.json'));
            return {
                id: d.name,
                displayName: pageJson?.displayName ?? pageJson?.name ?? d.name
            };
        });

        if (order.length > 0) {
            pages.sort((a, b) => {
                const normalizeOrder = order.map((o) => typeof o === 'string' ? o : o.name);
                const ai = normalizeOrder.indexOf(a.id);
                const bi = normalizeOrder.indexOf(b.id);
                if (ai === -1) return 1;
                if (bi === -1) return -1;
                return ai - bi;
            });
        }

        res.json({ success: true, pages });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/layout/:pageId', (req, res) => {
    try {
        const pageFolder = path.join(PAGES_PATH, req.params.pageId);
        const visualsFolder = path.join(pageFolder, 'visuals');
        const pageJson = readJsonFile(path.join(pageFolder, 'page.json'));

        if (!fs.existsSync(visualsFolder)) {
            return res.json({ success: true, pageInfo: pageJson, visuals: [] });
        }

        const visuals = fs.readdirSync(visualsFolder, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => {
                const visualJson = readJsonFile(path.join(visualsFolder, d.name, 'visual.json'));
                return {
                    id: d.name,
                    visualType: visualJson?.visual?.visualType ?? 'unknown',
                    position: visualJson?.position ?? {}
                };
            });

        res.json({ success: true, pageInfo: pageJson, visuals });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/write-visual', (req, res) => {
    try {
        const { pageId, visualJson } = req.body;

        if (!pageId || !visualJson) {
            return res.status(400).json({ error: 'pageId and visualJson are required' });
        }

        const visualId = generateId();
        const visualDir = path.join(PAGES_PATH, pageId, 'visuals', visualId);

        fs.mkdirSync(visualDir, { recursive: true });

        const { "$schema": _s, "name": _n, ...rest } = visualJson;

        const finalVisual = {
            "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.6.0/schema.json",
            "name": visualId,
            ...rest
        };

        fs.writeFileSync(
            path.join(visualDir, 'visual.json'),
            JSON.stringify(finalVisual, null, 2),
            'utf8'
        );

        res.json({ success: true, visualId, message: 'Visual created. Reload Power BI to see changes.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/write-measure', (req, res) => {
    try {
        const { tableName, measureName, daxExpression } = req.body;

        if (!tableName || !measureName || !daxExpression) {
            return res.status(400).json({ error: 'tableName, measureName and daxExpression are required' });
        }

        const tmdlFile = path.join(TABLES_PATH, `${tableName}.tmdl`);
        if (!fs.existsSync(tmdlFile)) {
            return res.status(404).json({ error: `Table file not found: ${tableName}.tmdl` });
        }

        let tmdlContent = fs.readFileSync(tmdlFile, 'utf8');

        if (tmdlContent.includes(`measure '${measureName}'`)) {
            return res.status(400).json({ error: `Measure '${measureName}' already exists in ${tableName}` });
        }

        const measureBlock = `\n\tmeasure '${measureName}' = ${daxExpression}\n\t\tformatString: 0\n`;
        tmdlContent = tmdlContent.trimEnd() + '\n' + measureBlock;

        fs.writeFileSync(tmdlFile, tmdlContent, 'utf8');

        res.json({ success: true, message: `Measure '${measureName}' added to ${tableName}.tmdl` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/write-page', (req, res) => {
    try {
        const { pageName, visuals } = req.body;

        if (!pageName || !Array.isArray(visuals)) {
            return res.status(400).json({ error: 'pageName and visuals array are required' });
        }

        const pageId = generateId();
        const pageDir = path.join(PAGES_PATH, pageId);
        const visualsDir = path.join(pageDir, 'visuals');
        fs.mkdirSync(visualsDir, { recursive: true });

        let pageJson = null;
        try {
            const allDirs = fs.readdirSync(PAGES_PATH, { withFileTypes: true })
                .filter(d => d.isDirectory() && d.name !== pageId);
            for (const d of allDirs) {
                const ep = readJsonFile(path.join(PAGES_PATH, d.name, 'page.json'));
                if (ep && ep['$schema']) {
                    pageJson = { ...ep };
                    break;
                }
            }
        } catch {}

        if (!pageJson) {
            pageJson = {
                "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/reportPage/1.0.0/schema.json",
                "displayOption": "FitToPage",
                "width": 1280,
                "height": 720
            };
        }

        pageJson.name = pageId;
        pageJson.displayName = pageName;
        fs.writeFileSync(path.join(pageDir, 'page.json'), JSON.stringify(pageJson, null, 2), 'utf8');

        const pagesJsonPath = path.join(PAGES_PATH, 'pages.json');
        let pagesJson = {
            "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pages/1.0.0/schema.json",
            "pageOrder": []
        };
        if (fs.existsSync(pagesJsonPath)) {
            pagesJson = readJsonFile(pagesJsonPath) || pagesJson;
        }
        if (!pagesJson.pageOrder) pagesJson.pageOrder = [];
        if (!pagesJson["$schema"]) pagesJson["$schema"] = "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pages/1.0.0/schema.json";
        pagesJson.pageOrder.push(pageId);
        fs.writeFileSync(pagesJsonPath, JSON.stringify(pagesJson, null, 2), 'utf8');

        const createdVisuals = [];
        visuals.forEach((visualJson) => {
            const visualId = generateId();
            const visualDir = path.join(visualsDir, visualId);
            fs.mkdirSync(visualDir, { recursive: true });

            const { "$schema": _s, "name": _n, ...rest } = visualJson;
            const finalVisual = {
                "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.6.0/schema.json",
                "name": visualId,
                ...rest
            };

            fs.writeFileSync(path.join(visualDir, 'visual.json'), JSON.stringify(finalVisual, null, 2), 'utf8');
            createdVisuals.push(visualId);
        });

        res.json({ success: true, pageId, pageName, visualCount: createdVisuals.length, message: `Page "${pageName}" created with ${createdVisuals.length} visuals. Reload Power BI to see it.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/delete-visual', (req, res) => {
    try {
        const { pageId, visualId } = req.body;
        const visualDir = path.join(PAGES_PATH, pageId, 'visuals', visualId);

        if (!fs.existsSync(visualDir)) {
            return res.status(404).json({ error: 'Visual not found' });
        }

        fs.rmSync(visualDir, { recursive: true });
        res.json({ success: true, message: 'Visual deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/health', (req, res) => {
    if (!REPORT_PATH && !SEMANTIC_MODEL_PATH) {
        return res.json({ status: 'ok', report: '⏳ No project selected yet', semanticModel: '⏳ No project selected yet' });
    }
    const reportExists = REPORT_PATH && fs.existsSync(REPORT_PATH);
    const modelExists  = SEMANTIC_MODEL_PATH && fs.existsSync(SEMANTIC_MODEL_PATH);
    res.json({
        status: reportExists && modelExists ? 'ok' : 'error',
        report: reportExists ? '✅ Found' : '❌ Not found: ' + REPORT_PATH,
        semanticModel: modelExists ? '✅ Found' : '❌ Not found: ' + SEMANTIC_MODEL_PATH
    });
});

app.listen(PORT, () => {
    console.log(`\n🟢 Power BI Bridge running on http://localhost:${PORT}`);
    console.log(`\n   Waiting for project selection — open Power BI and switch to Developer Mode.`);
    console.log(`\n   Endpoints:`);
    console.log(`   GET  /health          → check paths are valid`);
    console.log(`   GET  /discover        → scan for .pbip projects`);
    console.log(`   GET  /schema          → all tables, columns, measures`);
    console.log(`   GET  /pages           → all report pages`);
    console.log(`   GET  /layout/:pageId  → visuals on a page`);
    console.log(`   POST /write-visual    → create a new visual`);
    console.log(`   POST /write-measure   → create a new DAX measure`);
    console.log(`   POST /write-page      → create a new report page`);
    console.log(`   DELETE /delete-visual → delete a visual\n`);
});