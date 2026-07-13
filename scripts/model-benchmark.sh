#!/bin/bash
# Side-by-side benchmark: Qwen3.6-35B-A3B (target) vs Qwen3.5-35B-A3B and Qwen3.5-27B (prior-gen baselines)
# Tests quality and speed across CLAMS query categories

MODELS=("qwen3.6:35b-a3b" "qwen3.5:35b-a3b" "qwen3.5:27b")

# Representative prompts across key query categories
declare -a CATEGORIES=(
  "material_lookup"
  "comparison"
  "compliance_check"
  "calculation"
  "general_engineering"
)

declare -a PROMPTS=(
  "What are the key mechanical properties of PEEK (polyetheretherketone) and what makes it suitable for aerospace bearing applications?"
  "Compare Rulon LR vs Turcite B for linear guide bearing applications in CNC machines. Consider wear rate, friction coefficient, and moisture resistance."
  "What FDA compliance requirements apply to using UHMW-PE in food contact conveyor components? Are there specific grades that are FDA compliant?"
  "A bronze bushing with 1.5 inch ID, 2.0 inch OD, and 1.0 inch length has a radial load of 500 lbs at 100 RPM. Calculate the PV value and recommend if this exceeds typical limits for oil-impregnated bronze."
  "What are the common failure modes for polymer thrust washers in hydraulic cylinder applications, and how can they be prevented?"
)

echo "=========================================="
echo "CLAMS Model Benchmark"
echo "Date: $(date)"
echo "=========================================="
echo ""

for i in "${!PROMPTS[@]}"; do
  echo "------------------------------------------"
  echo "Category: ${CATEGORIES[$i]}"
  echo "Prompt: ${PROMPTS[$i]}"
  echo "------------------------------------------"
  echo ""

  for model in "${MODELS[@]}"; do
    echo ">>> Model: $model"
    echo ""

    # Time the response
    start_time=$(python3 -c "import time; print(time.time())")

    response=$(ollama run "$model" "${PROMPTS[$i]}" --nowordwrap 2>/dev/null)

    end_time=$(python3 -c "import time; print(time.time())")
    elapsed=$(python3 -c "print(f'{$end_time - $start_time:.2f}')")

    echo "$response"
    echo ""
    echo "--- Time: ${elapsed}s ---"
    echo ""
  done

  echo "=========================================="
  echo ""
done

echo "Benchmark complete."
