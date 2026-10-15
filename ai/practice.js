// Pure module for generating mathematical practice problems for AI from scratch (plan lane K).
// No DOM, no storage: tested by ai/practice.test.mjs.

/** Small, fast 32-bit PRNG (mulberry32). */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function choice(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export const skills = {
  // 1. Mean (Average)
  "mean": {
    title: "Mean (Average)",
    lesson: "s3-math-warm-up.html",
    gen(rng) {
      const a = randInt(rng, 2, 18);
      const b = randInt(rng, 2, 18);
      const c = randInt(rng, 2, 18);
      const targetMean = randInt(rng, 5, 20);
      const d = targetMean * 4 - (a + b + c);
      const nums = [a, b, c, d];
      const sum = a + b + c + d;
      const ans = targetMean;
      return {
        id: "mean",
        lesson: "s3-math-warm-up.html",
        title: "Mean (Average)",
        prompt: `Calculate the arithmetic mean \\(\\bar{x} = \\frac{1}{n} \\sum_{i=1}^n x_i\\) of the four numbers: \\(${nums.join(", ")}\\).`,
        answer: ans,
        tol: 0.01,
        steps: [
          `Add up the values: ${nums.join(" + ")} = ${sum}.`,
          `Count of values n = 4.`,
          `Divide the sum by n: ${sum} / 4 = ${ans}.`,
          `The arithmetic mean is ${ans}.`
        ]
      };
    }
  },

  // 2. Mean Squared Error (MSE)
  "mse": {
    title: "Mean Squared Error (MSE)",
    lesson: "s3-math-warm-up.html",
    gen(rng) {
      // Pick 3 residuals whose squares sum to a multiple of 3
      const triples = [
        [1, 1, 2], // 1+1+4 = 6 -> 2
        [1, 2, 2], // 1+4+4 = 9 -> 3
        [2, 2, 1], // 4+4+1 = 9 -> 3
        [2, 3, 1], // 4+9+1 = 14 (not /3)
        [3, 3, 3], // 9+9+9 = 27 -> 9
        [1, 2, 4], // 1+4+16 = 21 -> 7
        [0, 3, 3], // 0+9+9 = 18 -> 6
        [2, 4, 2]  // 4+16+4 = 24 -> 8
      ].filter(t => (t[0]*t[0] + t[1]*t[1] + t[2]*t[2]) % 3 === 0);
      const res = choice(rng, triples);
      const s1 = choice(rng, [-1, 1]) * res[0];
      const s2 = choice(rng, [-1, 1]) * res[1];
      const s3 = choice(rng, [-1, 1]) * res[2];
      const y1 = randInt(rng, 5, 20), yhat1 = y1 - s1;
      const y2 = randInt(rng, 5, 20), yhat2 = y2 - s2;
      const y3 = randInt(rng, 5, 20), yhat3 = y3 - s3;
      const sq1 = s1 * s1, sq2 = s2 * s2, sq3 = s3 * s3;
      const sumSq = sq1 + sq2 + sq3;
      const ans = sumSq / 3;
      return {
        id: "mse",
        lesson: "s3-math-warm-up.html",
        title: "Mean Squared Error (MSE)",
        prompt: `Given true values \\(y = [${y1}, ${y2}, ${y3}]\\) and model predictions \\(\\hat{y} = [${yhat1}, ${yhat2}, ${yhat3}]\\), compute the Mean Squared Error: \\(\\text{MSE} = \\frac{1}{3} \\sum_{i=1}^3 (y_i - \\hat{y}_i)^2\\).`,
        answer: ans,
        tol: 0.01,
        steps: [
          `Compute errors (y - ŷ): (${y1} - ${yhat1}) = ${s1}, (${y2} - ${yhat2}) = ${s2}, (${y3} - ${yhat3}) = ${s3}.`,
          `Square each error: (${s1})² = ${sq1}, (${s2})² = ${sq2}, (${s3})² = ${sq3}.`,
          `Sum squared errors: ${sq1} + ${sq2} + ${sq3} = ${sumSq}.`,
          `Divide by n = 3: ${sumSq} / 3 = ${ans}.`,
          `The MSE is ${ans}.`
        ]
      };
    }
  },

  // 3. Dot Product
  "dot-product": {
    title: "Dot Product",
    lesson: "01-matrices-are-moves.html",
    gen(rng) {
      const u = [randInt(rng, -4, 4), randInt(rng, -4, 4), randInt(rng, -4, 4)];
      const v = [randInt(rng, -4, 4), randInt(rng, -4, 4), randInt(rng, -4, 4)];
      const p0 = u[0] * v[0], p1 = u[1] * v[1], p2 = u[2] * v[2];
      const ans = p0 + p1 + p2;
      return {
        id: "dot-product",
        lesson: "01-matrices-are-moves.html",
        title: "Dot Product",
        prompt: `Compute the dot product \\(\\mathbf{u} \\cdot \\mathbf{v}\\) for vectors \\(\\mathbf{u} = [${u.join(", ")}]\\) and \\(\\mathbf{v} = [${v.join(", ")}]\\).`,
        answer: ans,
        tol: 0.01,
        steps: [
          `Multiply matching components: (${u[0]})(${v[0]}) = ${p0}, (${u[1]})(${v[1]}) = ${p1}, (${u[2]})(${v[2]}) = ${p2}.`,
          `Sum products: ${p0} + ${p1} + ${p2} = ${ans}.`,
          `The dot product is ${ans}.`
        ]
      };
    }
  },

  // 4. Matrix-Vector Product
  "matrix-vector": {
    title: "Matrix-Vector Product",
    lesson: "01-matrices-are-moves.html",
    gen(rng) {
      const a = randInt(rng, -3, 4);
      const b = randInt(rng, -3, 4);
      const c = randInt(rng, -3, 4);
      const d = randInt(rng, -3, 4);
      const x = randInt(rng, -3, 4);
      const y = randInt(rng, -3, 4);
      const ans = a * x + b * y;
      return {
        id: "matrix-vector",
        lesson: "01-matrices-are-moves.html",
        title: "Matrix-Vector Product",
        prompt: `For matrix \\(A = \\begin{pmatrix} ${a} & ${b} \\\\ ${c} & ${d} \\end{pmatrix}\\) and vector \\(\\mathbf{v} = \\begin{pmatrix} ${x} \\\\ ${y} \\end{pmatrix}\\), what is the first component of \\(A \\mathbf{v}\\)?`,
        answer: ans,
        tol: 0.01,
        steps: [
          `Take row 1 of A: [${a}, ${b}] and vector v: [${x}, ${y}]ᵀ.`,
          `Compute row dot product: (${a})(${x}) + (${b})(${y}) = ${a * x} + ${b * y} = ${ans}.`,
          `The first component is ${ans}.`
        ]
      };
    }
  },

  // 5. 2x2 Determinant
  "determinant-2x2": {
    title: "2×2 Determinant",
    lesson: "l1-systems-and-inverses.html",
    gen(rng) {
      const a = randInt(rng, -4, 5);
      const b = randInt(rng, -4, 5);
      const c = randInt(rng, -4, 5);
      const d = randInt(rng, -4, 5);
      const ad = a * d;
      const bc = b * c;
      const ans = ad - bc;
      return {
        id: "determinant-2x2",
        lesson: "l1-systems-and-inverses.html",
        title: "2×2 Determinant",
        prompt: `Find the determinant \\(\\det(A)\\) of the matrix \\(A = \\begin{pmatrix} ${a} & ${b} \\\\ ${c} & ${d} \\end{pmatrix}\\).`,
        answer: ans,
        tol: 0.01,
        steps: [
          `Main diagonal product: (${a})(${d}) = ${ad}.`,
          `Anti-diagonal product: (${b})(${c}) = ${bc}.`,
          `Subtract: ${ad} - (${bc}) = ${ans}.`,
          `The determinant is ${ans}.`
        ]
      };
    }
  },

  // 6. 2x2 Inverse Entry
  "inverse-2x2-det": {
    title: "2×2 Inverse Entry",
    lesson: "l1-systems-and-inverses.html",
    gen(rng) {
      // Pick a, d, det = 1 or -1 or 2
      const det = choice(rng, [-2, -1, 1, 2]);
      const a = randInt(rng, -3, 3) || 1;
      const d = choice(rng, [-4, -2, 2, 4]);
      // ad - bc = det -> bc = ad - det
      const prod = a * d - det;
      // find factors of prod
      let b = 1, c = prod;
      for (let factor = 1; factor <= Math.abs(prod); factor++) {
        if (prod % factor === 0 && Math.abs(factor) <= 5 && Math.abs(prod / factor) <= 5) {
          b = factor;
          c = prod / factor;
        }
      }
      const actualDet = a * d - b * c;
      const ans = d / actualDet;
      return {
        id: "inverse-2x2-det",
        lesson: "l1-systems-and-inverses.html",
        title: "2×2 Inverse Entry",
        prompt: `Recall that \\(A^{-1} = \\frac{1}{\\det(A)} \\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}\\). For \\(A = \\begin{pmatrix} ${a} & ${b} \\\\ ${c} & ${d} \\end{pmatrix}\\), what is the top-left entry of \\(A^{-1}\\)?`,
        answer: ans,
        tol: 0.01,
        steps: [
          `Compute determinant: det(A) = (${a})(${d}) - (${b})(${c}) = ${a * d} - ${b * c} = ${actualDet}.`,
          `Top-left entry of the adjoint matrix is d = ${d}.`,
          `Scale by 1/det(A): ${d} / ${actualDet} = ${ans}.`,
          `The top-left entry of A⁻¹ is ${ans}.`
        ]
      };
    }
  },

  // 7. Polynomial Derivative at a Point
  "poly-derivative": {
    title: "Polynomial Derivative",
    lesson: "02-gradients.html",
    gen(rng) {
      const a = randInt(rng, 1, 5);
      const b = randInt(rng, -6, 6);
      const c = randInt(rng, -10, 10);
      const x0 = randInt(rng, -3, 4);
      const ans = 2 * a * x0 + b;
      return {
        id: "poly-derivative",
        lesson: "02-gradients.html",
        title: "Polynomial Derivative",
        prompt: `Given \\(f(x) = ${a}x^2 ${b >= 0 ? "+ " + b : "- " + Math.abs(b)}x ${c >= 0 ? "+ " + c : "- " + Math.abs(c)}\\), find the derivative value \\(f'(${x0})\\).`,
        answer: ans,
        tol: 0.01,
        steps: [
          `Apply power rule: d/dx(${a}x²) = ${2 * a}x, d/dx(${b}x) = ${b}, d/dx(${c}) = 0.`,
          `Derivative function is f'(x) = ${2 * a}x ${b >= 0 ? "+ " + b : "- " + Math.abs(b)}.`,
          `Evaluate at x = ${x0}: ${2 * a}(${x0}) + (${b}) = ${2 * a * x0} + (${b}) = ${ans}.`,
          `The derivative f'(${x0}) is ${ans}.`
        ]
      };
    }
  },

  // 8. Chain Rule with Numbers
  "chain-rule": {
    title: "Chain Rule",
    lesson: "04-backprop.html",
    gen(rng) {
      const a = randInt(rng, 1, 4);
      const b = randInt(rng, -3, 3);
      const x0 = randInt(rng, 1, 3);
      const u0 = a * x0 + b;
      const dudx = a;
      const dydu = 2 * u0;
      const ans = dydu * dudx;
      return {
        id: "chain-rule",
        lesson: "04-backprop.html",
        title: "Chain Rule",
        prompt: `Let \\(y = u^2\\) where \\(u = ${a}x ${b >= 0 ? "+ " + b : "- " + Math.abs(b)}\\). Using the chain rule \\(\\frac{dy}{dx} = \\frac{dy}{du} \\cdot \\frac{du}{dx}\\), find \\(\\frac{dy}{dx}\\) evaluated at \\(x = ${x0}\\).`,
        answer: ans,
        tol: 0.01,
        steps: [
          `Compute inner value at x = ${x0}: u = ${a}(${x0}) + (${b}) = ${u0}.`,
          `Outer derivative: dy/du = 2u = 2(${u0}) = ${dydu}.`,
          `Inner derivative: du/dx = ${dudx}.`,
          `Multiply by chain rule: dy/dx = (${dydu}) · (${dudx}) = ${ans}.`,
          `The derivative value is ${ans}.`
        ]
      };
    }
  },

  // 9. Partial Derivative
  "partial-derivative": {
    title: "Partial Derivative",
    lesson: "c2-many-variables.html",
    gen(rng) {
      const a = randInt(rng, 1, 4);
      const b = randInt(rng, -4, 4);
      const c = randInt(rng, 1, 4);
      const x0 = randInt(rng, -2, 3);
      const y0 = randInt(rng, -2, 3);
      const ans = 2 * a * x0 + b * y0;
      return {
        id: "partial-derivative",
        lesson: "c2-many-variables.html",
        title: "Partial Derivative",
        prompt: `Let \\(f(x, y) = ${a}x^2 ${b >= 0 ? "+ " + b : "- " + Math.abs(b)}xy + ${c}y^2\\). Find \\(\\frac{\\partial f}{\\partial x}\\) evaluated at \\((x, y) = (${x0}, ${y0})\\).`,
        answer: ans,
        tol: 0.01,
        steps: [
          `Treat y as a constant: ∂/∂x(${a}x²) = ${2 * a}x, ∂/∂x(${b}xy) = ${b}y, ∂/∂x(${c}y²) = 0.`,
          `Partial derivative formula: ∂f/∂x = ${2 * a}x ${b >= 0 ? "+ " + b : "- " + Math.abs(b)}y.`,
          `Substitute (x, y) = (${x0}, ${y0}): ${2 * a}(${x0}) + (${b})(${y0}) = ${2 * a * x0} + ${b * y0} = ${ans}.`,
          `The partial derivative is ${ans}.`
        ]
      };
    }
  },

  // 10. Gradient Descent Step
  "gradient-step": {
    title: "Gradient Descent Step",
    lesson: "02-gradients.html",
    gen(rng) {
      const w0 = randInt(rng, 2, 10);
      const eta = choice(rng, [0.1, 0.2, 0.5]);
      const grad = choice(rng, [-4, -2, 2, 4, 6]);
      const delta = +(eta * grad).toFixed(2);
      const ans = +(w0 - delta).toFixed(2);
      return {
        id: "gradient-step",
        lesson: "02-gradients.html",
        title: "Gradient Descent Step",
        prompt: `A weight starts at \\(w = ${w0}\\). The learning rate is \\(\\eta = ${eta}\\) and the gradient is \\(\\nabla L = ${grad}\\). After one gradient update \\(w_{\\text{new}} = w - \\eta \\cdot \\nabla L\\), what is \\(w_{\\text{new}}\\)?`,
        answer: ans,
        tol: 0.01,
        steps: [
          `Update rule: w_new = w - η · ∇L.`,
          `Compute step size: η · ∇L = ${eta} · (${grad}) = ${delta}.`,
          `Subtract from weight: ${w0} - (${delta}) = ${ans}.`,
          `The updated weight is ${ans}.`
        ]
      };
    }
  },

  // 11. Logarithm Rules
  "log-rules": {
    title: "Logarithm Rules",
    lesson: "s3-math-warm-up.html",
    gen(rng) {
      const m = randInt(rng, 2, 5);
      const k = randInt(rng, 1, 4);
      const a = 2 ** m;
      const b = 2 ** k;
      const ans = m + k;
      return {
        id: "log-rules",
        lesson: "s3-math-warm-up.html",
        title: "Logarithm Rules",
        prompt: `Evaluate \\(\\log_2(${a}) + \\log_2(${b})\\).`,
        answer: ans,
        tol: 0.01,
        steps: [
          `Recall log property: log₂(A) + log₂(B) = log₂(A · B).`,
          `log₂(${a}) = ${m} because 2^${m} = ${a}.`,
          `log₂(${b}) = ${k} because 2^${k} = ${b}.`,
          `Sum: ${m} + ${k} = ${ans}.`,
          `The value is ${ans}.`
        ]
      };
    }
  },

  // 12. Softmax Probability
  "softmax-3": {
    title: "Softmax Probability",
    lesson: "05-probability-and-loss.html",
    gen(rng) {
      // Pick an offset and multiplier so sum of exp is an integer
      const configs = [
        { mult: 2, p: 0.25, name: "ln(2) ≈ 0.693", diff: 0.693, desc: "e^0=1, e^0=1, e^ln(2)=2 -> sum=4, P(1)=1/4=0.25" },
        { mult: 3, p: 0.20, name: "ln(3) ≈ 1.099", diff: 1.099, desc: "e^0=1, e^0=1, e^ln(3)=3 -> sum=5, P(1)=1/5=0.20" },
        { mult: 8, p: 0.10, name: "ln(8) ≈ 2.079", diff: 2.079, desc: "e^0=1, e^0=1, e^ln(8)=8 -> sum=10, P(1)=1/10=0.10" },
      ];
      const cfg = choice(rng, configs);
      const base = randInt(rng, 1, 5);
      const s1 = base, s2 = base, s3 = +(base + cfg.diff).toFixed(3);
      const ans = cfg.p;
      return {
        id: "softmax-3",
        lesson: "05-probability-and-loss.html",
        title: "Softmax Probability",
        prompt: `Given class logits \\(s = [${s1}, ${s2}, ${s3}]\\) where \\(${s3} - ${base} = \\ln(${cfg.mult})\\), compute the softmax probability \\(P(y = 1) = \\frac{e^{s_1}}{\\sum_{j=1}^3 e^{s_j}}\\).`,
        answer: ans,
        tol: 0.01,
        steps: [
          `Shift invariance trick: subtract max or base (${base}) from all logits -> [0, 0, ln(${cfg.mult})].`,
          `Exponentiate: e⁰ = 1, e⁰ = 1, e^{ln(${cfg.mult})} = ${cfg.mult}.`,
          `Sum of exponentials: 1 + 1 + ${cfg.mult} = ${2 + cfg.mult}.`,
          `Softmax probability P(y=1) = 1 / ${2 + cfg.mult} = ${ans}.`,
          `The probability is ${ans}.`
        ]
      };
    }
  },

  // 13. Bayes Theorem with Counts
  "bayes-table": {
    title: "Bayes' Theorem with Counts",
    lesson: "p1-probability-and-bayes.html",
    gen(rng) {
      const pairs = [
        [15, 5],  // 15/20 = 75%
        [24, 6],  // 24/30 = 80%
        [8, 32],  // 8/40 = 20%
        [18, 6],  // 18/24 = 75%
        [12, 12], // 12/24 = 50%
        [35, 15]  // 35/50 = 70%
      ];
      const [tp, fp] = choice(rng, pairs);
      const total = tp + fp;
      const ans = (tp / total) * 100;
      return {
        id: "bayes-table",
        lesson: "p1-probability-and-bayes.html",
        title: "Bayes' Theorem with Counts",
        prompt: `In a medical screening: ${tp} people with the condition test positive (true positives) and ${fp} healthy people also test positive (false positives). What is the precision \\(P(\\text{Condition} \\mid \\text{Positive}) = \\frac{\\text{True Positives}}{\\text{Total Positives}}\\) as a percentage (0–100)?`,
        answer: ans,
        tol: 0.1,
        steps: [
          `Identify true positives: tp = ${tp}.`,
          `Total positive test results: ${tp} + ${fp} = ${total}.`,
          `Calculate fraction: ${tp} / ${total} = ${tp / total}.`,
          `Convert to percentage: ${tp / total} × 100% = ${ans}%.`,
          `The precision is ${ans}%.`
        ]
      };
    }
  },

  // 14. Expected Value E[X]
  "expectation": {
    title: "Expected Value E[X]",
    lesson: "p1-probability-and-bayes.html",
    gen(rng) {
      const p1 = 0.2, p2 = 0.5, p3 = 0.3;
      const x1 = randInt(rng, 1, 5) * 2;
      const x2 = randInt(rng, 1, 5) * 2;
      const x3 = randInt(rng, 1, 5) * 2;
      const prod1 = +(x1 * p1).toFixed(2);
      const prod2 = +(x2 * p2).toFixed(2);
      const prod3 = +(x3 * p3).toFixed(2);
      const ans = +(prod1 + prod2 + prod3).toFixed(2);
      return {
        id: "expectation",
        lesson: "p1-probability-and-bayes.html",
        title: "Expected Value E[X]",
        prompt: `A random variable \\(X\\) takes values \\([${x1}, ${x2}, ${x3}]\\) with probabilities \\([0.2, 0.5, 0.3]\\). Compute the expected value \\(\\mathbb{E}[X] = \\sum x_i P(X = x_i)\\).`,
        answer: ans,
        tol: 0.01,
        steps: [
          `Multiply each value by its probability: (${x1})(0.2) = ${prod1}, (${x2})(0.5) = ${prod2}, (${x3})(0.3) = ${prod3}.`,
          `Sum products: ${prod1} + ${prod2} + ${prod3} = ${ans}.`,
          `The expected value is ${ans}.`
        ]
      };
    }
  },

  // 15. Population Variance
  "variance": {
    title: "Variance Var(X)",
    lesson: "p2-describing-data.html",
    gen(rng) {
      // Pick deviations: [-d, 0, d] with d = 3 or 6 -> sum = 0, sum of squares = 2*d^2 divisible by 3 (18->6, 72->24)
      const d = choice(rng, [3, 6]);
      const mean = randInt(rng, 8, 15);
      const x1 = mean - d, x2 = mean, x3 = mean + d;
      const sq1 = d * d, sq2 = 0, sq3 = d * d;
      const sumSq = sq1 + sq2 + sq3;
      const ans = sumSq / 3;
      return {
        id: "variance",
        lesson: "p2-describing-data.html",
        title: "Variance Var(X)",
        prompt: `For the dataset \\(X = [${x1}, ${x2}, ${x3}]\\), first find the mean \\(\\mu\\), then compute the population variance \\(\\text{Var}(X) = \\frac{1}{3} \\sum_{i=1}^3 (x_i - \\mu)^2\\).`,
        answer: ans,
        tol: 0.01,
        steps: [
          `Compute mean: (${x1} + ${x2} + ${x3}) / 3 = ${3 * mean} / 3 = ${mean}.`,
          `Deviations (x - μ): ${x1 - mean}, ${x2 - mean}, ${x3 - mean}.`,
          `Squared deviations: (${-d})² = ${sq1}, (0)² = 0, (${d})² = ${sq3}.`,
          `Mean of squared deviations: (${sq1} + 0 + ${sq3}) / 3 = ${sumSq} / 3 = ${ans}.`,
          `The variance is ${ans}.`
        ]
      };
    }
  },

  // 16. Conditional Probability
  "conditional-prob": {
    title: "Conditional Probability",
    lesson: "p1-probability-and-bayes.html",
    gen(rng) {
      const pB = choice(rng, [0.4, 0.5, 0.6, 0.8]);
      const frac = choice(rng, [0.25, 0.5, 0.75]);
      const pAB = +(pB * frac).toFixed(3);
      const ans = frac;
      return {
        id: "conditional-prob",
        lesson: "p1-probability-and-bayes.html",
        title: "Conditional Probability",
        prompt: `Given \\(P(A \\cap B) = ${pAB}\\) and \\(P(B) = ${pB}\\), compute \\(P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}\\).`,
        answer: ans,
        tol: 0.01,
        steps: [
          `Conditional probability definition: P(A | B) = P(A ∩ B) / P(B).`,
          `Substitute values: ${pAB} / ${pB} = ${ans}.`,
          `The conditional probability is ${ans}.`
        ]
      };
    }
  },

  // 17. Shannon Entropy
  "coin-entropy": {
    title: "Shannon Entropy",
    lesson: "p5-information.html",
    gen(rng) {
      const k = choice(rng, [2, 4, 8, 16]);
      const ans = Math.log2(k);
      return {
        id: "coin-entropy",
        lesson: "p5-information.html",
        title: "Shannon Entropy",
        prompt: `A variable has ${k} equally likely outcomes with probability \\(p = \\frac{1}{${k}}\\) each. Compute its Shannon entropy \\(H = -\\sum_{i=1}^{${k}} p_i \\log_2(p_i)\\) in bits.`,
        answer: ans,
        tol: 0.01,
        steps: [
          `For each outcome, -p log₂(p) = -(1/${k}) · log₂(1/${k}) = (1/${k}) · log₂(${k}).`,
          `Summing over all ${k} outcomes: ${k} · (1/${k}) · log₂(${k}) = log₂(${k}).`,
          `Since ${k} = 2^${ans}, log₂(${k}) = ${ans}.`,
          `The entropy is ${ans} bits.`
        ]
      };
    }
  },

  // 18. Eigenvalues of a 2x2 Symmetric Matrix
  "eigenvalues-2x2": {
    title: "2×2 Matrix Eigenvalues",
    lesson: "l2-eigenvectors-and-pca.html",
    gen(rng) {
      const a = randInt(rng, 3, 9);
      const b = randInt(rng, 1, 4);
      const ans = a + b;
      return {
        id: "eigenvalues-2x2",
        lesson: "l2-eigenvectors-and-pca.html",
        title: "2×2 Matrix Eigenvalues",
        prompt: `For the symmetric matrix \\(A = \\begin{pmatrix} ${a} & ${b} \\\\ ${b} & ${a} \\end{pmatrix}\\), what is its largest eigenvalue \\(\\lambda_1\\)?`,
        answer: ans,
        tol: 0.01,
        steps: [
          `Characteristic equation: det(A - λI) = (${a} - λ)² - (${b})² = 0.`,
          `Difference of squares: (${a} - λ - ${b})(${a} - λ + ${b}) = 0.`,
          `Eigenvalues are λ₁ = ${a} + ${b} = ${a + b} and λ₂ = ${a} - ${b} = ${a - b}.`,
          `The largest eigenvalue is ${ans}.`
        ]
      };
    }
  },

  // 19. Euclidean Vector Norm
  "vector-norm": {
    title: "Vector Norm ||v||",
    lesson: "01-matrices-are-moves.html",
    gen(rng) {
      const triples = [
        [3, 4, 5],
        [6, 8, 10],
        [5, 12, 13],
        [8, 15, 17],
        [9, 12, 15]
      ];
      const [u, v, hyp] = choice(rng, triples);
      const s1 = choice(rng, [-1, 1]) * u;
      const s2 = choice(rng, [-1, 1]) * v;
      const sq1 = s1 * s1, sq2 = s2 * s2;
      const ans = hyp;
      return {
        id: "vector-norm",
        lesson: "01-matrices-are-moves.html",
        title: "Vector Norm ||v||",
        prompt: `Find the Euclidean \\(L_2\\) norm \\(\\|\\mathbf{v}\\| = \\sqrt{v_1^2 + v_2^2}\\) of the vector \\(\\mathbf{v} = [${s1}, ${s2}]\\).`,
        answer: ans,
        tol: 0.01,
        steps: [
          `Square each component: (${s1})² = ${sq1}, (${s2})² = ${sq2}.`,
          `Sum squares: ${sq1} + ${sq2} = ${sq1 + sq2}.`,
          `Take the square root: √${sq1 + sq2} = ${ans}.`,
          `The norm is ${ans}.`
        ]
      };
    }
  },

  // 20. Cosine Similarity
  "cosine-similarity": {
    title: "Cosine Similarity",
    lesson: "01-matrices-are-moves.html",
    gen(rng) {
      const cases = [
        { u: [3, 4], v: [-4, 3], ans: 0.0, desc: "orthogonal" },
        { u: [3, 4], v: [6, 8], ans: 1.0, desc: "parallel" },
        { u: [5, 0], v: [-5, 0], ans: -1.0, desc: "opposite" },
        { u: [3, 4], v: [3, -4], ans: -0.28, desc: "(9 - 16)/25 = -7/25 = -0.28" },
        { u: [3, 4], v: [4, 3], ans: 0.96, desc: "(12 + 12)/25 = 24/25 = 0.96" },
        { u: [5, 0], v: [3, 4], ans: 0.60, desc: "15 / (5 * 5) = 15/25 = 0.60" },
        { u: [0, 5], v: [3, 4], ans: 0.80, desc: "20 / (5 * 5) = 20/25 = 0.80" }
      ];
      const item = choice(rng, cases);
      const dot = item.u[0] * item.v[0] + item.u[1] * item.v[1];
      const normU = Math.hypot(...item.u);
      const normV = Math.hypot(...item.v);
      return {
        id: "cosine-similarity",
        lesson: "01-matrices-are-moves.html",
        title: "Cosine Similarity",
        prompt: `Compute the cosine similarity \\(\\cos(\\theta) = \\frac{\\mathbf{u} \\cdot \\mathbf{v}}{\\|\\mathbf{u}\\| \\|\\mathbf{v}\\|}\\) for vectors \\(\\mathbf{u} = [${item.u.join(", ")}]\\) and \\(\\mathbf{v} = [${item.v.join(", ")}]\\).`,
        answer: item.ans,
        tol: 0.01,
        steps: [
          `Dot product: (${item.u[0]})(${item.v[0]}) + (${item.u[1]})(${item.v[1]}) = ${dot}.`,
          `Norms: ||u|| = ${normU}, ||v|| = ${normV}, product = ${normU * normV}.`,
          `Divide: ${dot} / ${normU * normV} = ${item.ans}.`,
          `The cosine similarity is ${item.ans}.`
        ]
      };
    }
  }
};

/** Generate a practice problem for skillId using the given rng. */
export function generate(skillId, rng = Math.random) {
  const s = skills[skillId];
  if (!s) throw new Error(`Unknown practice skill: ${skillId}`);
  return s.gen(rng);
}

/** Check user answer against expected answer with tolerance. */
export function checkAnswer(expected, userAns, tol = 0.01) {
  const num = typeof userAns === "number" ? userAns : parseFloat(String(userAns).trim().replace(/,/g, ""));
  if (Number.isNaN(num)) return false;
  return Math.abs(num - expected) <= tol;
}
