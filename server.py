from flask import Flask, request, jsonify, render_template_string, send_file
from sympy.logic.boolalg import SOPform
from sympy import symbols
import matplotlib.pyplot as plt
import numpy as np
import io, base64

app = Flask(__name__)

# ---------- Static/HTML ----------
@app.route("/")
def index():
    with open("index.html", "r") as f:
        return render_template_string(f.read())

@app.route("/style.css")
def css():
    return send_file("style.css")

@app.route("/script.js")
def js():
    return send_file("script.js")

# ---------- Helpers ----------
def expr_to_verilog(expr_str: str) -> str:
    """Convert SymPy boolean string to Verilog expression."""
    s = expr_str.strip()
    if s.lower() == "true":
        return "1'b1"
    if s.lower() == "false":
        return "1'b0"
    return s.replace("True", "1'b1").replace("False", "1'b0")

def expected_tt_len(nvars: int) -> int:
    return 1 << nvars  # 2^n

# ---------- Core endpoint ----------
@app.route("/solve_truth", methods=["POST"])
def solve_truth():
    data = request.json or {}
    vars_list = data.get("vars", [])
    truth_values_raw = data.get("truth", [])

    try:
        # ---- Validate variables ----
        vars_list = [v.strip() for v in vars_list if v.strip()]
        n = len(vars_list)
        if n not in (2, 3, 4):
            return jsonify({"error": "Only 2–4 variables supported"}), 400

        # ---- Validate truth table length ----
        truth_values = [str(v).strip() for v in truth_values_raw]
        need = expected_tt_len(n)
        if len(truth_values) != need:
            return jsonify({"error": f"Truth table length mismatch: got {len(truth_values)}, need {need} for {n} variables"}), 400

        # ---- Symbols ----
        variables = symbols(vars_list)

        # ---- Build minterms / dont-cares ----
        minterms, dontcares = [], []
        for i, val in enumerate(truth_values):
            up = val.upper()
            if up not in ("0", "1", "X"):
                return jsonify({"error": f"Invalid truth value '{val}' at index {i}. Use only 0, 1, or X."}), 400
            if up == "1":
                minterms.append(i)
            elif up == "X":
                dontcares.append(i)

        # ---- Minimize using SOPform ----
        simplified_expr = SOPform(variables, minterms, dontcares if dontcares else None)
        expr_str = str(simplified_expr)

        # ---- Draw White K-map Grid with labels ----
        size = (2, 2) if n == 2 else (2, 4) if n == 3 else (4, 4)
        rows, cols = size
        kmap = np.full(size, "0", dtype=object)

        for i, val in enumerate(truth_values):
            r, c = divmod(i, cols)
            kmap[r, c] = val.upper()

        fig, ax = plt.subplots()
        ax.set_facecolor("white")

        # Draw grid + values
        for i in range(rows):
            for j in range(cols):
                ax.add_patch(plt.Rectangle((j-0.5, i-0.5), 1, 1, fill=False, edgecolor="black"))
                ax.text(j, i, str(kmap[i, j]), va="center", ha="center", fontsize=12)

        # Build row/col labels with variable names
        row_vars = vars_list[: n // 2] or [vars_list[0]]
        col_vars = vars_list[n // 2 :] or [vars_list[-1]]

        row_labels = [f"{''.join(row_vars)}={format(r, f'0{len(row_vars)}b')}" for r in range(rows)]
        col_labels = [f"{''.join(col_vars)}={format(c, f'0{len(col_vars)}b')}" for c in range(cols)]

        # Draw row labels on left
        for i, lab in enumerate(row_labels):
            ax.text(-1.2, i, lab, va="center", ha="center", fontsize=10, color="blue")

        # Draw col labels on top
        for j, lab in enumerate(col_labels):
            ax.text(j, -1.2, lab, va="center", ha="center", fontsize=10, color="blue")

        ax.set_xlim(-1.5, cols-0.5)
        ax.set_ylim(rows-0.5, -1.5)
        ax.set_xticks([])
        ax.set_yticks([])
        fig.tight_layout(pad=0.5)

        buf = io.BytesIO()
        plt.savefig(buf, format="png")
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode("utf-8")
        plt.close(fig)

        
        # ---- Verilog module + testbench ----
        # ---- Verilog module + testbench ----
        verilog_expr = expr_to_verilog(expr_str)
        inputs_csv = ", ".join(vars_list)

        verilog_code = f"""module logic_func({inputs_csv}, F);
    input {inputs_csv};
    output F;
    assign F = {verilog_expr};
endmodule
"""

        tb_monitor_signals = " ".join([f"{v}=%b" for v in vars_list]) + " F=%b"
        tb = f"""module tb;
    reg {inputs_csv};
    wire F;

    logic_func uut({inputs_csv}, F);

    integer i;
    initial begin
        $display("Testing all input combinations:");
        for (i = 0; i < {1<<n}; i = i + 1) begin
            {{ {inputs_csv} }} = i[{n-1}:0];
            #1;
            $display("{tb_monitor_signals}", {inputs_csv}, F);
        end
        $finish;
    end
endmodule
"""

        return jsonify({
            "minimized": expr_str,
            "kmap": img_base64,
            "verilog": verilog_code,
            "testbench": tb
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == "__main__":
    app.run(debug=True)
