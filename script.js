const genBtn = document.getElementById("genBtn");
const solveBtn = document.getElementById("solveBtn");
const truthTableDiv = document.getElementById("truthTable");
const advancedSection = document.getElementById("advanced");
const kmapImg = document.getElementById("kmap");

genBtn.addEventListener("click", generateTruthTable);
solveBtn.addEventListener("click", solveFromTruth);

let VARIABLES = [];
let OUTPUTS = [];

function generateTruthTable() {
    const varsInput = document.getElementById("vars").value.trim();
    if (!varsInput) return alert("Enter variables");

    VARIABLES = varsInput.split(/\s+/);
    if (VARIABLES.length < 2 || VARIABLES.length > 4)
        return alert("Only 2–4 variables supported");

    const rows = 2 ** VARIABLES.length;
    let html = `<table class="truth-table"><thead><tr>`;
    VARIABLES.forEach(v => html += `<th>${v}</th>`);
    html += `<th>Output</th></tr></thead><tbody>`;

    for (let i = 0; i < rows; i++) {
        html += "<tr>";
        for (let j = VARIABLES.length - 1; j >= 0; j--)
            html += `<td>${(i >> j) & 1}</td>`;
        html += `<td><input class="output-input" maxlength="1" placeholder="0/1/X"></td></tr>`;
    }

    html += "</tbody></table>";
    truthTableDiv.innerHTML = html;
    solveBtn.disabled = false;
    advancedSection.classList.add("hidden");
}

function solveFromTruth() {
    resetKMap();
    const rows = document.querySelectorAll(".output-input");
    let minterms = [];
    let dontCares = [];
    OUTPUTS = [];

    rows.forEach((cell, i) => {
        const v = cell.value.trim().toUpperCase();
        if (!["0", "1", "X"].includes(v))
            return alert("Use only 0, 1, or X");

        OUTPUTS.push(v);
        if (v === "1") minterms.push(i);
        if (v === "X") dontCares.push(i);
    });

    const implicants = quineMcCluskey(minterms, dontCares, VARIABLES.length);
    const expr = formatExpression(implicants);

    document.getElementById("result").textContent =
`Minimized SOP Expression:
${expr}

Minterms: ${minterms.join(", ")}
Don't cares: ${dontCares.join(", ")}`;

    drawKMap();
    drawGroups(implicants);
    generateVerilog(expr);
    generateTestbench();
    advancedSection.classList.remove("hidden");
}

/* =======================
   QUINE–MCCLUSKEY (WITH DC)
======================= */

function quineMcCluskey(minterms, dcs, vars) {
    let terms = [...minterms, ...dcs].map(m => ({
        bits: m.toString(2).padStart(vars, '0'),
        used: false
    }));

    let groups = {};
    terms.forEach(t => {
        const ones = [...t.bits].filter(b => b === '1').length;
        (groups[ones] ??= []).push(t);
    });

    let primes = [];

    while (true) {
        let newGroups = {};
        let combined = false;
        const keys = Object.keys(groups).map(Number).sort((a, b) => a - b);

        for (let i = 0; i < keys.length - 1; i++) {
            groups[keys[i]].forEach(a => {
                groups[keys[i + 1]].forEach(b => {
                    const diff = diffBits(a.bits, b.bits);
                    if (diff === 1) {
                        const merged = mergeBits(a.bits, b.bits);
                        const ones = [...merged].filter(c => c === '1').length;
                        (newGroups[ones] ??= []).push({ bits: merged, used: false });
                        a.used = b.used = true;
                        combined = true;
                    }
                });
            });
        }

        Object.values(groups).flat().forEach(t => {
            if (!t.used && !primes.includes(t.bits))
                primes.push(t.bits);
        });

        if (!combined) break;
        groups = newGroups;
    }

    return primes;
}

function diffBits(a, b) {
    let d = 0;
    for (let i = 0; i < a.length; i++)
        if (a[i] !== b[i]) d++;
    return d;
}

function mergeBits(a, b) {
    return a.split('').map((v, i) => v === b[i] ? v : '-').join('');
}

/* =======================
   EXPRESSION FORMAT
======================= */

function formatExpression(imps) {
    return imps.map(bits =>
        bits.split('').map((b, i) => {
            if (b === '-') return '';
            return b === '1' ? VARIABLES[i] : VARIABLES[i] + "'";
        }).join('')
    ).join(' + ');
}

/* =======================
   K-MAP DRAWING
======================= */

function drawKMap() {
    const vars = VARIABLES.length;

    // Rows & columns based on variables
    let rows, cols;
    if (vars === 2) [rows, cols] = [2, 2];
    if (vars === 3) [rows, cols] = [2, 4];
    if (vars === 4) [rows, cols] = [4, 4];

    // Initialize logical K-map model
    initKMapModel(vars);

    const map = document.createElement("div");
    map.id = "kmap";
    map.className = "kmap";
    map.style.display = "grid";
    map.style.gridTemplateColumns = `80px repeat(${cols}, 50px)`;
    map.style.gridTemplateRows = `40px repeat(${rows}, 50px)`;
    map.style.position = "relative";

    // Gray-code labels
    const rowBits = Math.floor(vars / 2);
    const colBits = vars - rowBits;

    const rowLabels = grayLabels(rowBits);
    const colLabels = grayLabels(colBits);

    /* ─────────── TOP LEFT EMPTY CELL ─────────── */
    map.appendChild(document.createElement("div"));

    /* ─────────── COLUMN HEADERS ─────────── */
    colLabels.forEach(label => {
        const div = document.createElement("div");
        div.className = "kmap-label";
        div.textContent =
            VARIABLES.slice(rowBits).join("") + " = " + label;
        map.appendChild(div);
    });

    /* ─────────── ROWS + CELLS ─────────── */
    for (let r = 0; r < rows; r++) {
        // Row header
        const rowHeader = document.createElement("div");
        rowHeader.className = "kmap-label";
        rowHeader.textContent =
            VARIABLES.slice(0, rowBits).join("") + " = " + rowLabels[r];
        map.appendChild(rowHeader);

        // Cells
        for (let c = 0; c < cols; c++) {
            const cell = KMAP.cells.find(x => x.row === r && x.col === c);

            const div = document.createElement("div");
            div.className = "kmap-cell";
            div.dataset.row = r;
            div.dataset.col = c;
            div.textContent = cell?.value ?? "0";

            if (cell?.value === "1") div.classList.add("one");
            if (cell?.value === "X") div.classList.add("dc");

            cell.el = div;
            map.appendChild(div);
        }
    }

    // Replace old map (if any)
    const old = document.getElementById("kmap");
    if (old) old.replaceWith(map);
    else document.getElementById("advanced").appendChild(map);
}


/* =======================
   GROUP RECTANGLES
======================= */

function drawGroups(imps) {
    const map = document.getElementById("kmap");
    const cellSize = 50;
    const labelRowHeight = 40;
    const labelColWidth = 80;

    imps.forEach(bits => {
        let covered = [];

        OUTPUTS.forEach((v, i) => {
            if (v !== "1" && v !== "X") return;

            const bin = i.toString(2).padStart(VARIABLES.length, '0');
            let match = true;

            for (let j = 0; j < bits.length; j++) {
                if (bits[j] !== '-' && bits[j] !== bin[j]) {
                    match = false;
                    break;
                }
            }

            if (match) {
                covered.push(getKMapIndex(i, VARIABLES.length));
            }
        });

        if (!covered.length) return;

        const rows = covered.map(i => Math.floor(i / KMAP.cols));
        const cols = covered.map(i => i % KMAP.cols);

        const rowMin = Math.min(...rows);
        const rowMax = Math.max(...rows);
        const colMin = Math.min(...cols);
        const colMax = Math.max(...cols);

        const wrapRow = (rowMax - rowMin === KMAP.rows - 1);
        const wrapCol = (colMax - colMin === KMAP.cols - 1);

        // Normal rectangle
        if (!wrapRow && !wrapCol) {
            drawBox(rowMin, rowMax, colMin, colMax, false);
        }

        // Horizontal wrap
        if (wrapCol) {
            drawBox(rowMin, rowMax, 0, colMin, true);
            drawBox(rowMin, rowMax, colMax, KMAP.cols - 1, true);
        }

        // Vertical wrap
        if (wrapRow) {
            drawBox(0, rowMin, colMin, colMax, true);
            drawBox(rowMax, KMAP.rows - 1, colMin, colMax, true);
        }
    });

    function drawBox(r1, r2, c1, c2, dashed) {
        const box = document.createElement("div");
        box.className = "kmap-group";
        if (dashed) box.classList.add("dashed");

        box.style.top =
            `${labelRowHeight + r1 * cellSize}px`;
        box.style.left =
            `${labelColWidth + c1 * cellSize}px`;
        box.style.width =
            `${(c2 - c1 + 1) * cellSize}px`;
        box.style.height =
            `${(r2 - r1 + 1) * cellSize}px`;

        map.appendChild(box);
    }
}



/* =======================
   VERILOG
======================= */

function generateVerilog(expr) {
    document.getElementById("verilog").textContent =
`module logic_fn(
    input ${VARIABLES.join(", ")},
    output Y
);
assign Y = ${expr.replace(/\+/g,"|").replace(/'/g,"~")};
endmodule`;
}

/* =======================
   TESTBENCH
======================= */

function generateTestbench() {
    document.getElementById("testbench").textContent =
`module tb;
reg ${VARIABLES.join(", ")};
wire Y;
logic_fn uut(${VARIABLES.join(", ")}, Y);
initial begin
    $monitor(${VARIABLES.map(v => `"${v}=%b"`).join(", ")}, ", Y=%b", ${VARIABLES.join(", ")}, Y);
    #20 $finish;
end
endmodule`;
}

function grayCode(n) {
    return n ^ (n >> 1);
}

function getKMapIndex(binaryIndex, vars) {
    if (vars === 2) {
        const row = grayCode((binaryIndex >> 1) & 1);
        const col = grayCode(binaryIndex & 1);
        return row * 2 + col;
    }

    if (vars === 3) {
        const row = grayCode((binaryIndex >> 2) & 1);
        const col = grayCode(binaryIndex & 3);
        return row * 4 + col;
    }

    if (vars === 4) {
        const row = grayCode((binaryIndex >> 2) & 3);
        const col = grayCode(binaryIndex & 3);
        return row * 4 + col;
    }
}

let KMAP = {
    rows: 0,
    cols: 0,
    cells: [],
    groups: []
};

function initKMapModel(vars) {
    if (vars === 2) [KMAP.rows, KMAP.cols] = [2, 2];
    if (vars === 3) [KMAP.rows, KMAP.cols] = [2, 4];
    if (vars === 4) [KMAP.rows, KMAP.cols] = [4, 4];

    KMAP.cells = [];

    OUTPUTS.forEach((v, i) => {
        const idx = getKMapIndex(i, vars);
        const r = Math.floor(idx / KMAP.cols);
        const c = idx % KMAP.cols;

        KMAP.cells.push({
            index: i,
            value: v,
            row: r,
            col: c,
            el: null
        });
    });
}

let dragGroup = null;

document.addEventListener("mousedown", e => {
    if (!e.target.classList.contains("kmap-cell")) return;

    dragGroup = {
        start: e.target,
        cells: new Set([e.target])
    };
    e.target.classList.add("selected");
});

document.addEventListener("mouseover", e => {
    if (!dragGroup || !e.target.classList.contains("kmap-cell")) return;

    dragGroup.cells.add(e.target);
    e.target.classList.add("selected");
});

document.addEventListener("mouseup", () => {
    if (!dragGroup) return;

    const group = Array.from(dragGroup.cells).map(c => ({
        row: +c.dataset.row,
        col: +c.dataset.col
    }));

    if (!isPowerOfTwo(group.length)) {
        alert("Invalid K-Map group: size must be power of two");
        group.forEach(c =>
            document
                .querySelector(`.kmap-cell[data-row="${c.row}"][data-col="${c.col}"]`)
                ?.classList.remove("selected")
        );
        dragGroup = null;
        return;
    }

    KMAP.groups.push(group);
    drawGroupOutline(group);

    updateExpressionFromGroups();   // ✅ ← STEP 8 GOES HERE

    dragGroup = null;
});


function deriveSOPFromGroups() {
    return KMAP.groups.map(group => {
        return VARIABLES.map((v, i) => {
            const bits = group.map(c => {
                const cell = KMAP.cells.find(x => x.row === c.row && x.col === c.col);
                return (cell.index >> (VARIABLES.length - 1 - i)) & 1;
            });

            if (bits.every(b => b === 1)) return v;
            if (bits.every(b => b === 0)) return v + "'";
            return "";
        }).join("");
    }).join(" + ");
}

function derivePOSFromGroups() {
    return KMAP.groups.map(group => {
        return "(" + VARIABLES.map((v, i) => {
            const bits = group.map(c => {
                const cell = KMAP.cells.find(x => x.row === c.row && x.col === c.col);
                return (cell.index >> (VARIABLES.length - 1 - i)) & 1;
            });

            if (bits.every(b => b === 0)) return v;
            if (bits.every(b => b === 1)) return v + "'";
            return "";
        }).filter(Boolean).join(" + ") + ")";
    }).join("");
}

function exportKMap() {
    html2canvas(document.getElementById("kmap")).then(canvas => {
        const link = document.createElement("a");
        link.download = "kmap.png";
        link.href = canvas.toDataURL();
        link.click();
    });
}

function resetKMap() {
    // Remove old K-map DOM
    const oldMap = document.getElementById("kmap");
    if (oldMap) oldMap.remove();

    // Reset model
    KMAP = {
        rows: 0,
        cols: 0,
        cells: [],
        groups: []
    };

    // Reset drag state
    dragGroup = null;
}

function grayLabels(bits) {
    const count = 1 << bits;
    const labels = [];
    for (let i = 0; i < count; i++) {
        labels.push(grayCode(i).toString(2).padStart(bits, "0"));
    }
    return labels;
}

function isPowerOfTwo(n) {
    return n && (n & (n - 1)) === 0;
}

function isWrapAroundGroup(group) {
    const rows = group.map(c => c.row);
    const cols = group.map(c => c.col);

    const rowWrap =
        Math.max(...rows) - Math.min(...rows) === KMAP.rows - 1;

    const colWrap =
        Math.max(...cols) - Math.min(...cols) === KMAP.cols - 1;

    return rowWrap || colWrap;
}

let KMAP_MODE = "SOP";

function setMode(mode) {
    KMAP_MODE = mode;
    updateExpressionFromGroups();
}

function updateExpressionFromGroups() {
    const out =
        KMAP_MODE === "SOP"
            ? deriveSOPFromGroups()
            : derivePOSFromGroups();

    document.getElementById("result").textContent =
`${KMAP_MODE} Expression:
${out}`;
}

