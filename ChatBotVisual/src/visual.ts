import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;

type Provider = "gemini" | "openai" | "anthropic" | "groq";
type Mode = "stakeholder" | "developer";

const BRIDGE_URL = "http://localhost:3001";

export class Visual implements IVisual {
    private container: HTMLElement;
    private dataContext: string = "";
    private provider: Provider = "gemini";
    private apiKey: string = "";
    private mode: Mode = "stakeholder";
    private isSpeaking: boolean = false;
    private mediaRecorder: any = null;
    private audioChunks: Blob[] = [];

    constructor(options: VisualConstructorOptions) {
        this.container = options.element;
        this.container.style.fontFamily = "Segoe UI, sans-serif";
        this.container.style.padding = "12px";
        this.container.style.display = "flex";
        this.container.style.height = "100%";
        this.container.style.boxSizing = "border-box";
        this.container.style.overflow = "hidden";
        this.container.style.width = "100%";
        this.container.style.backgroundColor = "#000000";
        this.container.style.color = "#ffffff";
        this.createVisual();
        this.loadState();
    }

    private createVisual() {
        this.container.innerHTML = `
<div id="chatbotContainer" style="display:flex;flex-direction:column;height:100%;gap:8px;width:100%;overflow:hidden;box-sizing:border-box;">

  <div style="display:flex;gap:4px;flex-shrink:0;">
    <button id="modeStakeholder" style="flex:1;padding:5px;background:#0078d4;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;font-weight:600;">
      👤 Stakeholder
    </button>
    <button id="modeDeveloper" style="flex:1;padding:5px;background:#333;color:#aaa;border:none;border-radius:4px;font-size:11px;cursor:pointer;">
      🛠 Developer
    </button>
  </div>

  <div style="display:flex;gap:8px;align-items:center;min-width:0;">
    <select id="providerSelect" style="padding:6px;border:1px solid #ccc;border-radius:4px;font-size:12px;flex-shrink:0;">
      <option value="gemini">Gemini</option>
      <option value="openai">OpenAI</option>
      <option value="anthropic">Anthropic</option>
      <option value="groq">Groq</option>
    </select>
    <input id="apiKeyInput" type="password" placeholder="Paste API Key here..."
      style="flex:1;min-width:0;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:12px;" />
    <button id="askBtn" style="padding:6px 12px;background:#0078d4;color:white;border:none;border-radius:4px;font-size:12px;cursor:pointer;flex-shrink:0;">Ask</button>
    <button id="clearBtn" style="padding:6px 12px;background:#e81123;color:white;border:none;border-radius:4px;font-size:12px;cursor:pointer;flex-shrink:0;">Clear</button>
  </div>

  <div id="devControls" style="display:none;flex-direction:column;gap:6px;flex-shrink:0;">
    <div style="display:flex;gap:4px;align-items:center;min-width:0;">
      <select id="projectSelect" style="flex:1;min-width:0;padding:5px;background:#1a1a1a;color:white;border:1px solid #444;border-radius:4px;font-size:11px;">
        <option value="">🔍 Scanning for projects...</option>
      </select>
      <div id="bridgeStatus" style="font-size:10px;padding:3px 8px;border-radius:10px;background:#333;color:#aaa;white-space:nowrap;flex-shrink:0;">
        ⏳ Connecting...
      </div>
    </div>
    <div style="display:flex;gap:4px;align-items:center;min-width:0;">
      <select id="pageSelect" style="flex:1;min-width:0;padding:5px;background:#1a1a1a;color:white;border:1px solid #444;border-radius:4px;font-size:11px;">
        <option value="">Select a project first...</option>
      </select>
      <select id="intentSelect" style="padding:5px;background:#1a1a1a;color:white;border:1px solid #444;border-radius:4px;font-size:11px;flex-shrink:0;">
        <option value="visual">📊 Visual</option>
        <option value="measure">🧮 Measure</option>
        <option value="page">📋 Page</option>
      </select>
    </div>
  </div>

  <div id="response" style="flex:1;overflow-y:auto;overflow-x:hidden;border:1px solid #ddd;border-radius:6px;padding:10px;background:#fafafa;color:black;font-size:13px;user-select:text;cursor:text;word-break:break-word;min-width:0;"></div>

  <div style="display:flex;gap:4px;margin-top:4px;align-items:center;min-width:0;">
    <input id="question" type="text" placeholder="Ask a question about the data..."
      style="flex:1;min-width:0;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;" />
    <button id="micBtn" title="Speak your question" style="padding:6px 10px;background:#333;color:white;border:none;border-radius:4px;font-size:14px;cursor:pointer;flex-shrink:0;">🎤</button>
    <button id="stopTtsBtn" title="Stop speaking" style="padding:6px 10px;background:#333;color:white;border:none;border-radius:4px;font-size:14px;cursor:pointer;display:none;flex-shrink:0;">⏹</button>
  </div>
</div>`;

        this.attachEventHandlers();
    }

    private attachEventHandlers() {
        const providerSelect  = this.container.querySelector("#providerSelect")  as HTMLSelectElement;
        const apiKeyInput     = this.container.querySelector("#apiKeyInput")      as HTMLInputElement;
        const input           = this.container.querySelector("#question")         as HTMLInputElement;
        const askBtn          = this.container.querySelector("#askBtn")           as HTMLButtonElement;
        const clearBtn        = this.container.querySelector("#clearBtn")         as HTMLButtonElement;
        const responseDiv     = this.container.querySelector("#response")         as HTMLElement;
        const modeStakeholder = this.container.querySelector("#modeStakeholder")  as HTMLButtonElement;
        const modeDeveloper   = this.container.querySelector("#modeDeveloper")    as HTMLButtonElement;
        const devControls     = this.container.querySelector("#devControls")      as HTMLElement;
        const pageSelect      = this.container.querySelector("#pageSelect")       as HTMLSelectElement;
        const projectSelect   = this.container.querySelector("#projectSelect")    as HTMLSelectElement;

        modeStakeholder.addEventListener("click", () => {
            this.mode = "stakeholder";
            modeStakeholder.style.background = "#0078d4";
            modeStakeholder.style.color = "white";
            modeStakeholder.style.fontWeight = "600";
            modeDeveloper.style.background = "#333";
            modeDeveloper.style.color = "#aaa";
            modeDeveloper.style.fontWeight = "normal";
            devControls.style.display = "none";
            input.placeholder = "Ask a question about the data...";
        });

        modeDeveloper.addEventListener("click", async () => {
            this.mode = "developer";
            modeDeveloper.style.background = "#0078d4";
            modeDeveloper.style.color = "white";
            modeDeveloper.style.fontWeight = "600";
            modeStakeholder.style.background = "#333";
            modeStakeholder.style.color = "#aaa";
            modeStakeholder.style.fontWeight = "normal";
            devControls.style.display = "flex";
            input.placeholder = "e.g. create a bar chart of profit by employee...";
            await this.checkBridgeAndLoadPages(pageSelect);
        });

        projectSelect.addEventListener("change", async () => {
            const reportPath = projectSelect.value;
            if (!reportPath) return;
            const bridgeStatus = this.container.querySelector("#bridgeStatus") as HTMLElement;
            bridgeStatus.textContent = "⏳ Loading...";
            bridgeStatus.style.background = "#333";
            bridgeStatus.style.color = "#aaa";
            try {
                const res = await fetch(`${BRIDGE_URL}/config`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reportPath })
                });
                const data = await res.json();
                if (data.success) {
                    bridgeStatus.textContent = "✅ Connected";
                    bridgeStatus.style.background = "#1a3a1a";
                    bridgeStatus.style.color = "#3fb950";
                    await this.loadPages(pageSelect);
                } else {
                    bridgeStatus.textContent = "❌ Error";
                    bridgeStatus.style.background = "#3a1a1a";
                    bridgeStatus.style.color = "#f85149";
                }
            } catch {
                bridgeStatus.textContent = "❌ Bridge not running";
                bridgeStatus.style.background = "#3a1a1a";
                bridgeStatus.style.color = "#f85149";
            }
        });

        providerSelect.addEventListener("change", () => {
            this.provider = providerSelect.value as Provider;
            apiKeyInput.value = "";
            input.value = "";
            this.saveState(providerSelect.value, "", "");
        });

        const doAsk = async () => {
            const question = input.value.trim();
            if (!question) return;
            this.apiKey = apiKeyInput.value.trim();
            input.value = "";
            askBtn.disabled = true;
            askBtn.style.backgroundColor = "gray";
            askBtn.style.cursor = "not-allowed";

            if (this.mode === "stakeholder") {
                await this.stakeholderHandler(question, responseDiv);
            } else {
                await this.developerHandler(question, pageSelect.value, responseDiv);
            }

            askBtn.disabled = false;
            askBtn.style.backgroundColor = "#0078d4";
            askBtn.style.cursor = "pointer";
            this.saveState(providerSelect.value, apiKeyInput.value, responseDiv.innerHTML);
        };

        askBtn.addEventListener("click", doAsk);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !askBtn.disabled) doAsk(); });
        apiKeyInput.addEventListener("change", () => {
            this.saveState(providerSelect.value, apiKeyInput.value, responseDiv.innerHTML);
        });

        clearBtn.addEventListener("click", () => {
            responseDiv.innerHTML = "";
            this.saveState(providerSelect.value, apiKeyInput.value, "");
        });

        const micBtn     = this.container.querySelector("#micBtn")     as HTMLButtonElement;
        const stopTtsBtn = this.container.querySelector("#stopTtsBtn") as HTMLButtonElement;

        micBtn.addEventListener("click", async () => {
            if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
                this.mediaRecorder.stop();
                micBtn.textContent = "🎤";
                micBtn.style.background = "#333";
                return;
            }

            if (!this.apiKey) {
                responseDiv.innerHTML += `<div style="color:orange;word-wrap:break-word;">⚠ Enter an OpenAI API key first (needed for Whisper transcription).</div>`;
                return;
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.audioChunks = [];
                this.mediaRecorder = new (window as any).MediaRecorder(stream);

                this.mediaRecorder.ondataavailable = (e: any) => {
                    if (e.data.size > 0) this.audioChunks.push(e.data);
                };

                this.mediaRecorder.onstop = async () => {
                    stream.getTracks().forEach((t: any) => t.stop());
                    micBtn.textContent = "⏳";
                    micBtn.style.background = "#555";
                    micBtn.disabled = true;

                    try {
                        const audioBlob = new Blob(this.audioChunks, { type: "audio/webm" });
                        const formData = new FormData();
                        formData.append("file", audioBlob, "recording.webm");
                        formData.append("model", "whisper-1");

                        const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
                            method: "POST",
                            headers: { "Authorization": `Bearer ${this.apiKey}` },
                            body: formData
                        });

                        if (!res.ok) {
                            const err = await res.json();
                            throw new Error(err.error?.message ?? "Whisper API error");
                        }

                        const data = await res.json();
                        input.value = data.text;
                        if (!askBtn.disabled) doAsk();
                    } catch (err: any) {
                        responseDiv.innerHTML += `<div style="color:orange;word-wrap:break-word;">⚠ Whisper error: ${this.escapeHtml(err.message)}</div>`;
                    } finally {
                        micBtn.textContent = "🎤";
                        micBtn.style.background = "#333";
                        micBtn.disabled = false;
                        this.mediaRecorder = null;
                    }
                };

                this.mediaRecorder.start();
                micBtn.textContent = "🔴";
                micBtn.style.background = "#c00";

            } catch (err: any) {
                responseDiv.innerHTML += `<div style="color:orange;word-wrap:break-word;">⚠ Mic blocked: ${this.escapeHtml(err.message)}</div>`;
                micBtn.textContent = "🎤";
                micBtn.style.background = "#333";
            }
        });

        stopTtsBtn.addEventListener("click", () => {
            window.speechSynthesis.cancel();
            this.isSpeaking = false;
            stopTtsBtn.style.display = "none";
        });
    }

    private async checkBridgeAndLoadPages(pageSelect: HTMLSelectElement) {
        const bridgeStatus  = this.container.querySelector("#bridgeStatus")  as HTMLElement;
        const projectSelect = this.container.querySelector("#projectSelect") as HTMLSelectElement;
        try {
            const res  = await fetch(`${BRIDGE_URL}/health`);
            const data = await res.json();
            if (data.status === "ok") {
                bridgeStatus.textContent = "✅ Bridge connected";
                bridgeStatus.style.background = "#1a3a1a";
                bridgeStatus.style.color = "#3fb950";
                await this.loadProjects(projectSelect, pageSelect);
            } else {
                bridgeStatus.textContent = "❌ Path error";
                bridgeStatus.style.background = "#3a1a1a";
                bridgeStatus.style.color = "#f85149";
            }
        } catch {
            bridgeStatus.textContent = "❌ Bridge not running";
            bridgeStatus.style.background = "#3a1a1a";
            bridgeStatus.style.color = "#f85149";
            projectSelect.innerHTML = `<option value="">Run: node bridge.js</option>`;
            pageSelect.innerHTML    = `<option value="">Run: node bridge.js</option>`;
        }
    }

    private async loadProjects(projectSelect: HTMLSelectElement, pageSelect: HTMLSelectElement) {
        try {
            const res  = await fetch(`${BRIDGE_URL}/discover`);
            const data = await res.json();
            const projects = data.projects ?? [];
            if (projects.length === 0) {
                projectSelect.innerHTML = `<option value="">No .pbip files found</option>`;
                return;
            }
            projectSelect.innerHTML = `<option value="">Select a project...</option>` +
                projects.map((p: any) => `<option value="${p.reportPath}">📊 ${p.name}</option>`).join("");

            if (projects.length === 1) {
                projectSelect.value = projects[0].reportPath;
                projectSelect.dispatchEvent(new Event("change"));
            }
        } catch {
            projectSelect.innerHTML = `<option value="">Error scanning projects</option>`;
        }
    }

    private async loadPages(pageSelect: HTMLSelectElement) {
        try {
            const res  = await fetch(`${BRIDGE_URL}/pages`);
            const data = await res.json();
            const pages = data.pages?.pageOrder ?? data.pages ?? [];
            if (Array.isArray(pages) && pages.length > 0) {
                pageSelect.innerHTML = pages.map((p: any) => {
                    const id   = p.id ?? p;
                    const name = p.displayName ?? p.id ?? p;
                    return `<option value="${id}">${name}</option>`;
                }).join("");
            } else {
                pageSelect.innerHTML = `<option value="">Could not load pages</option>`;
            }
        } catch {
            pageSelect.innerHTML = `<option value="">Error loading pages</option>`;
        }
    }

    private async stakeholderHandler(question: string, responseDiv: HTMLElement) {
        responseDiv.innerHTML += `<div style="word-wrap:break-word;"><b>You:</b> ${this.escapeHtml(question)}</div>`;

        if (!this.apiKey) {
            responseDiv.innerHTML += `<div style="color:red"><b>Error:</b> API key required</div>`;
            return;
        }
        if (!this.dataContext) {
            responseDiv.innerHTML += `<div style="color:orange">⚠ No data loaded</div>`;
            return;
        }

        const thinkingDiv = document.createElement("div");
        thinkingDiv.textContent = "Thinking...";
        thinkingDiv.style.color = "gray";
        responseDiv.appendChild(thinkingDiv);
        responseDiv.scrollTop = responseDiv.scrollHeight;

        const prompt = `You are a helpful data analyst presenting insights to business stakeholders. Answer clearly and explain your reasoning. Only use data from the dataset below.\n\n${this.dataContext}\n\nQuestion: ${question}`;
        const answer = await this.callLLM(prompt, 800, 0.2);

        thinkingDiv.remove();
        const ansDiv = document.createElement("div");
        ansDiv.style.marginBottom = "6px";
        ansDiv.style.wordWrap = "break-word";
        ansDiv.style.overflowWrap = "break-word";
        ansDiv.style.maxWidth = "100%";
        const speakBtn = document.createElement("button");
        speakBtn.textContent = "🔊";
        speakBtn.title = "Read aloud";
        speakBtn.style.cssText = "margin-left:6px;padding:2px 6px;background:#333;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;vertical-align:middle;flex-shrink:0;";
        speakBtn.addEventListener("click", () => this.speakText(answer));
        ansDiv.innerHTML = `<b>${this.provider.toUpperCase()}:</b> ${this.renderMarkdown(answer)}`;
        ansDiv.appendChild(speakBtn);
        responseDiv.appendChild(ansDiv);
        responseDiv.scrollTop = responseDiv.scrollHeight;
    }

    private speakText(text: string) {
        const stopTtsBtn = this.container.querySelector("#stopTtsBtn") as HTMLButtonElement;
        if (!window.speechSynthesis) {
            const responseDiv = this.container.querySelector("#response") as HTMLElement;
            responseDiv.innerHTML += `<div style="color:orange">⚠ Text-to-speech not supported in this environment.</div>`;
            return;
        }

        window.speechSynthesis.cancel();

        const cleanText = text
            .replace(/\*\*(.+?)\*\*/g, "$1")
            .replace(/\*(.+?)\*/g, "$1")
            .replace(/^\* /gm, "")
            .replace(/#+\s/g, "");

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.volume = 1;

        utterance.onstart = () => {
            this.isSpeaking = true;
            stopTtsBtn.style.display = "inline-block";
        };
        utterance.onend = () => {
            this.isSpeaking = false;
            stopTtsBtn.style.display = "none";
        };
        utterance.onerror = () => {
            this.isSpeaking = false;
            stopTtsBtn.style.display = "none";
        };

        window.speechSynthesis.speak(utterance);
    }

    private async developerHandler(question: string, pageId: string, responseDiv: HTMLElement) {
        responseDiv.innerHTML += `<div style="word-wrap:break-word;"><b>You:</b> ${this.escapeHtml(question)}</div>`;

        if (!this.apiKey) {
            responseDiv.innerHTML += `<div style="color:red"><b>Error:</b> API key required</div>`;
            return;
        }
        if (!pageId) {
            responseDiv.innerHTML += `<div style="color:red"><b>Error:</b> Select a page first</div>`;
            return;
        }

        const thinkingDiv = document.createElement("div");
        thinkingDiv.style.color = "gray";
        responseDiv.appendChild(thinkingDiv);
        responseDiv.scrollTop = responseDiv.scrollHeight;

        try {
            thinkingDiv.textContent = "Reading schema and layout...";
            const [schemaRes, layoutRes] = await Promise.all([
                fetch(`${BRIDGE_URL}/schema`),
                fetch(`${BRIDGE_URL}/layout/${pageId}`)
            ]);
            const schemaData = await schemaRes.json();
            const layoutData = await layoutRes.json();
            const schemaText   = JSON.stringify(schemaData.schema, null, 2);
            const layoutText   = JSON.stringify(layoutData.visuals, null, 2);
            const canvasWidth  = layoutData.pageInfo?.width  ?? 1280;
            const canvasHeight = layoutData.pageInfo?.height ?? 720;

            const intentSelect = this.container.querySelector("#intentSelect") as HTMLSelectElement;
            const intent = intentSelect.value as "visual" | "measure" | "page";

            if (intent === "measure") {
                await this.handleMeasureCreation(question, schemaText, thinkingDiv, responseDiv);
            } else if (intent === "page") {
                await this.handlePageCreation(question, schemaText, thinkingDiv, responseDiv);
            } else {
                await this.handleVisualCreation(question, schemaText, layoutText, canvasWidth, canvasHeight, pageId, thinkingDiv, responseDiv);
            }

        } catch (err) {
            thinkingDiv.remove();
            responseDiv.innerHTML += `<div style="color:red"><b>Error:</b> ${this.escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
        }
    }

    private async handleVisualCreation(
        question: string, schemaText: string, layoutText: string,
        canvasWidth: number, canvasHeight: number, pageId: string,
        thinkingDiv: HTMLElement, responseDiv: HTMLElement
    ) {
        thinkingDiv.textContent = "Generating visual...";

        const compactSchema = Object.entries(JSON.parse(schemaText))
            .map(([t, v]: [string, any]) => `${t}: ${v.columns.join(", ")}`)
            .join("\n");

        const compactLayout = JSON.parse(layoutText)
            .map((v: any) => `x:${v.position?.x},y:${v.position?.y},w:${v.position?.width},h:${v.position?.height}`)
            .join(" | ");

        const visualPrompt = `Output ONLY a single line of raw JSON, no markdown.
Schema: ${compactSchema}
Occupied positions: ${compactLayout}
Canvas: ${canvasWidth}x${canvasHeight}
Request: "${question}"

Return this exact format (add more Y projections for multiple measures):
{"type":"clusteredBarChart","x":0,"y":0,"w":500,"h":300,"valueTable":"T","valueCol":"C","valueFunc":0,"catTable":"T","catCol":"C","extraY":[]}

For multiple Y measures use extraY: [{"valueTable":"T","valueCol":"C","valueFunc":0}]
Rules: exact table/column names, no overlap with occupied positions, valueFunc: 0=Sum 1=Count 2=Min 3=Max 4=Avg. Types: clusteredBarChart,clusteredColumnChart,stackedBarChart,stackedColumnChart,lineChart,pieChart,donutChart,card,tableEx,slicerVisual,ribbonChart,areaChart`;

        const rawVisual = await this.callLLM(visualPrompt, 300, 0);
        let vc: any;
        try {
            vc = this.parseJSON(rawVisual);
        } catch {
            thinkingDiv.remove();
            responseDiv.innerHTML += `<div style="color:red"><b>Parse Error:</b> AI returned invalid JSON.<br><small style="color:#888">${this.escapeHtml(rawVisual.slice(0, 600))}</small></div>`;
            return;
        }

        const makeProjection = (tbl: string, col: string, func: number) => ({
            field: { Aggregation: { Expression: { Column: { Expression: { SourceRef: { Entity: tbl } }, Property: col } }, Function: func } },
            queryRef: `Sum(${tbl}.${col})`,
            nativeQueryRef: `Sum of ${col}`
        });
        const makeCatProjection = (tbl: string, col: string) => ({
            field: { Column: { Expression: { SourceRef: { Entity: tbl } }, Property: col } },
            queryRef: `${tbl}.${col}`
        });

        const yProjections = [makeProjection(vc.valueTable, vc.valueCol, vc.valueFunc ?? 0),
            ...((vc.extraY ?? []).map((e: any) => makeProjection(e.valueTable, e.valueCol, e.valueFunc ?? 0)))];

        const visualJson = {
            name: "PLACEHOLDER",
            position: { x: vc.x ?? 0, y: vc.y ?? 0, z: 1000, height: vc.h ?? 300, width: vc.w ?? 500, tabOrder: 1000 },
            visual: {
                visualType: vc.type,
                query: {
                    queryState: {
                        Y: { projections: yProjections },
                        Category: { projections: [makeCatProjection(vc.catTable, vc.catCol)] }
                    }
                },
                drillFilterOtherVisuals: true
            }
        };

        const writeRes = await fetch(`${BRIDGE_URL}/write-visual`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pageId, visualJson })
        });
        const writeData = await writeRes.json();

        thinkingDiv.remove();
        if (writeData.success) {
            responseDiv.innerHTML += `<div style="color:green"><b>✅ Visual created!</b> Reload Power BI Desktop to see it.<br><small style="color:gray">ID: ${writeData.visualId}</small></div>`;
        } else {
            responseDiv.innerHTML += `<div style="color:red"><b>Error:</b> ${this.escapeHtml(writeData.error)}</div>`;
        }
    }

    private async handleMeasureCreation(
        question: string, schemaText: string,
        thinkingDiv: HTMLElement, responseDiv: HTMLElement
    ) {
        thinkingDiv.textContent = "Generating DAX measure...";

        const compactSchema = Object.entries(JSON.parse(schemaText))
            .map(([t, v]: [string, any]) => `${t}: ${v.columns.join(", ")}`)
            .join("\n");

        const measurePrompt = `Output ONLY a single line of raw JSON, no markdown, no newlines inside strings, no extra text:
{"tableName":"TABLENAME","measureName":"Measure Name","daxExpression":"DAX HERE"}

Schema:
${compactSchema}

Request: "${question}"

Rules:
- tableName must be an exact table name from the schema
- measureName should be short and descriptive
- daxExpression must be valid DAX on a SINGLE LINE using exact column names from schema, no line breaks inside it
- For cross-table calculations use RELATED() or SUMX()
- The entire output must be valid JSON parseable in one line`;

        const rawMeasure = await this.callLLM(measurePrompt, 1000, 0);
        let measureJson: any;
        try {
            measureJson = this.parseJSON(rawMeasure);
        } catch {
            thinkingDiv.remove();
            responseDiv.innerHTML += `<div style="color:red"><b>Error:</b> Could not parse measure JSON.<br><small style="color:#888">${this.escapeHtml(rawMeasure.slice(0, 800))}</small></div>`;
            return;
        }

        const writeRes  = await fetch(`${BRIDGE_URL}/write-measure`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(measureJson)
        });
        const writeData = await writeRes.json();

        thinkingDiv.remove();
        if (writeData.success) {
            responseDiv.innerHTML += `<div style="color:green"><b>✅ Measure created!</b><br>
                <b>${this.escapeHtml(measureJson.measureName)}</b> = ${this.escapeHtml(measureJson.daxExpression)}<br>
                <small style="color:gray">Reload Power BI Desktop to use it.</small></div>`;
        } else {
            responseDiv.innerHTML += `<div style="color:red"><b>Error:</b> ${this.escapeHtml(writeData.error)}</div>`;
        }
    }

    private async handlePageCreation(
        question: string, schemaText: string,
        thinkingDiv: HTMLElement, responseDiv: HTMLElement
    ) {
        thinkingDiv.textContent = "Designing full page...";

        const compactSchema = Object.entries(JSON.parse(schemaText))
            .map(([t, v]: [string, any]) => `${t}: ${v.columns.join(", ")}`)
            .join("\n");

        const pagePrompt = `Output ONLY a single line of raw JSON, no markdown.
Schema: ${compactSchema}
Request: "${question}"

Return exactly as many visuals as the user requested (default 3 if unspecified). Repeat the visual object for each chart:
{"pageName":"Title","visuals":[{"type":"clusteredBarChart","valueTable":"T","valueCol":"C","valueFunc":0,"catTable":"T","catCol":"C"}]}

Rules: exact table/column names from schema. valueFunc: 0=Sum 1=Count 2=Min 3=Max 4=Avg. Types: clusteredBarChart,clusteredColumnChart,lineChart,pieChart,card,tableEx.`;

        const rawPage = await this.callLLM(pagePrompt, 800, 0);
        let pageConfig: any;
        try {
            pageConfig = this.parseJSON(rawPage);
        } catch {
            thinkingDiv.remove();
            responseDiv.innerHTML += `<div style="color:red"><b>Parse Error:</b> AI returned invalid JSON.<br><small style="color:#888">${this.escapeHtml(rawPage.slice(0, 600))}</small></div>`;
            return;
        }

        const cols = 2;
        const cellW = 640;
        const cellH = 350;
        const builtVisuals = (pageConfig.visuals ?? []).map((v: any, i: number) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const isLastOdd = (pageConfig.visuals.length % 2 === 1) && (i === pageConfig.visuals.length - 1);
            return {
                name: "PLACEHOLDER",
                position: { x: col * cellW, y: row * cellH, z: 1000, height: cellH, width: isLastOdd ? 1280 : cellW, tabOrder: (i + 1) * 1000 },
                visual: {
                    visualType: v.type,
                    query: {
                        queryState: {
                            Y: { projections: [{ field: { Aggregation: { Expression: { Column: { Expression: { SourceRef: { Entity: v.valueTable } }, Property: v.valueCol } }, Function: v.valueFunc ?? 0 } }, queryRef: `Sum(${v.valueTable}.${v.valueCol})`, nativeQueryRef: `Sum of ${v.valueCol}` }] },
                            Category: { projections: [{ field: { Column: { Expression: { SourceRef: { Entity: v.catTable } }, Property: v.catCol } }, queryRef: `${v.catTable}.${v.catCol}` }] }
                        }
                    },
                    drillFilterOtherVisuals: true
                }
            };
        });

        thinkingDiv.textContent = `Creating page "${pageConfig.pageName}" with ${builtVisuals.length} visuals...`;

        const writeRes = await fetch(`${BRIDGE_URL}/write-page`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pageName: pageConfig.pageName, visuals: builtVisuals })
        });
        const writeData = await writeRes.json();

        thinkingDiv.remove();
        if (writeData.success) {
            responseDiv.innerHTML += `<div style="color:green"><b>✅ Page created!</b> "${writeData.pageName}" with ${writeData.visualCount} visuals.<br><small style="color:gray">Reload Power BI Desktop to see the new page.</small></div>`;
        } else {
            responseDiv.innerHTML += `<div style="color:red"><b>Error:</b> ${this.escapeHtml(writeData.error)}</div>`;
        }
    }

    public update(options: VisualUpdateOptions) {
        const dataView = options.dataViews?.[0];
        if (!dataView) return;

        const table = dataView.table;
        if (!table || table.rows.length === 0) return;

        const columns = table.columns.map(c => c.displayName);
        const rows = table.rows;

        let summary = `Dataset: ${rows.length} rows\nColumns: ${columns.join(", ")}\n\nStats:\n`;

        columns.forEach((col, i) => {
            const vals = rows.map(r => r[i]).filter(v => v != null);
            const nums = vals.map(Number).filter(v => !isNaN(v));
            const isDatePart = /year|month|day|date|yr|mon/i.test(col);

            if (nums.length === vals.length && nums.length > 0 && !isDatePart) {
                const sum = nums.reduce((a, b) => a + b, 0);
                summary += `${col}: min=${Math.min(...nums).toFixed(2)}, max=${Math.max(...nums).toFixed(2)}, sum=${sum.toFixed(2)}, avg=${(sum / nums.length).toFixed(2)}\n`;
            } else {
                const unique = [...new Set(vals.map(String))];
                summary += `${col}: ${unique.length <= 50 ? unique.join(", ") : unique.length + " unique values (e.g. " + unique.slice(0, 8).join(", ") + "...)"}\n`;
            }
        });

        const sample = rows.slice(0, 20);
        summary += `\nSample rows (${sample.length} of ${rows.length}):\n`;
        summary += columns.join(" | ") + "\n";
        summary += sample.map(r => r.map(cell => cell == null ? "" : String(cell)).join(" | ")).join("\n");

        this.dataContext = summary;
    }

    private async callLLM(prompt: string, maxTokens: number = 800, temperature: number = 0.2): Promise<string> {
        try {
            let answer = "No response received";

            if (this.provider === "gemini") {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { maxOutputTokens: maxTokens, temperature }
                    })
                });
                const json = await res.json();
                if (json?.error) return `Error: ${json.error.message ?? "Gemini API error"}`;
                const candidate = json?.candidates?.[0];
                const stopReason = candidate?.finishReason;
                if (stopReason && stopReason !== "STOP" && stopReason !== "MAX_TOKENS") {
                    return `Error: Gemini stopped early (${stopReason}). Try switching to OpenAI or Groq for complex visuals.`;
                }
                answer = candidate?.content?.parts?.[0]?.text ?? answer;
            }
            else if (this.provider === "openai") {
                const res = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.apiKey}` },
                    body: JSON.stringify({
                        model: "gpt-4o-mini", max_tokens: maxTokens, temperature,
                        messages: [{ role: "user", content: prompt }]
                    })
                });
                const json = await res.json();
                answer = json?.choices?.[0]?.message?.content ?? answer;
            }
            else if (this.provider === "anthropic") {
                const res = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": this.apiKey,
                        "anthropic-version": "2023-06-01"
                    },
                    body: JSON.stringify({
                        model: "claude-3-5-haiku-20241022", max_tokens: maxTokens,
                        messages: [{ role: "user", content: prompt }]
                    })
                });
                const json = await res.json();
                answer = json?.content?.[0]?.text ?? answer;
            }
            else if (this.provider === "groq") {
                const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.apiKey}` },
                    body: JSON.stringify({
                        model: "llama-3.3-70b-versatile", max_tokens: maxTokens, temperature,
                        messages: [{ role: "user", content: prompt }]
                    })
                });
                const json = await res.json();
                answer = json?.choices?.[0]?.message?.content ?? answer;
            }
            return answer;
        } catch (err) {
            return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
    }

    private parseJSON(raw: string): any {
        let s = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
        const match = s.match(/\{[\s\S]*\}/);
        if (match) s = match[0];
        try { return JSON.parse(s); } catch {}
        s = s.replace(/,\s*([}\]])/g, "$1");
        s = s.replace(/([{,]\s*)([a-zA-Z_$][\w$]*)\s*:/g, '$1"$2":');
        return JSON.parse(s);
    }

    private renderMarkdown(s: string): string {
        let html = s
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
        html = html.replace(/^\* (.+)$/gm, "<li>$1</li>");
        html = html.replace(/(<li>.*?<\/li>\s*)+/gs, (match) => {
            return `<ul style="margin:4px 0 4px 16px">${match}</ul>`;
        });
        html = html.replace(/\n/g, "<br>");
        return html;
    }

    private async saveState(provider: string, apiKey: string, chatHtml: string) {
        try {
            await fetch(`${BRIDGE_URL}/state`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider, apiKey, chatHtml })
            });
        } catch {}
    }

    private async loadState() {
        try {
            const res  = await fetch(`${BRIDGE_URL}/state`);
            const data = await res.json();
            if (!data.state) return;

            const { provider, apiKey, chatHtml } = data.state;

            const providerSelect = this.container.querySelector("#providerSelect") as HTMLSelectElement;
            const apiKeyInput    = this.container.querySelector("#apiKeyInput")    as HTMLInputElement;
            const responseDiv    = this.container.querySelector("#response")       as HTMLElement;

            if (provider) {
                providerSelect.value = provider;
                this.provider = provider as Provider;
            }
            if (apiKey) {
                apiKeyInput.value = apiKey;
                this.apiKey = apiKey;
            }
            if (chatHtml) {
                responseDiv.innerHTML = chatHtml;
                responseDiv.scrollTop = responseDiv.scrollHeight;
            }
        } catch {}
    }

    private escapeHtml(s: string) {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
}