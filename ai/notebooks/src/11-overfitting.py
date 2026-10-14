# %% [markdown]
# # Practice: overfitting, regularization and leakage
# *AI from scratch, chapter 11* · lesson: https://ihor.sh/ai/11-overfitting.html
#
# The everyday tools against overfitting, in scikit-learn: honest splits, a validation curve, ridge tuned by
# cross-validation, learning curves, and the most common way people fool themselves: **data leakage**.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).

# %%
import numpy as np
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split, cross_val_score, learning_curve
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler
from sklearn.linear_model import LinearRegression, Ridge, LogisticRegression

def check(test, msg="not yet"):
    "Runs test() and prints ✓ if it's true, ✗ and a hint if not (it never stops the notebook)."
    try:
        ok = bool(test())
    except Exception as e:
        ok, msg = False, f"{msg} ({type(e).__name__}: {e})"
    print("✓" if ok else f"✗ {msg}")

rng = np.random.default_rng(0)

# %% [markdown]
# ## 1. Train, validation, test
# 300 noisy points from a hidden curve. Split them 60/20/20 into train, validation and test with two calls to
# `train_test_split` (random_state=0 both times). Set `Xtr, Xva, Xte, ytr, yva, yte`.

# %%
x = rng.uniform(-1, 1, 300); y = 0.8 * np.sin(2.5 * x) + 0.3 * x + 0.25 * rng.standard_normal(300)
X = x[:, None]
Xtr = Xva = Xte = ytr = yva = yte = None
### BEGIN SOLUTION
Xtr, Xrest, ytr, yrest = train_test_split(X, y, test_size=0.4, random_state=0)
Xva, Xte, yva, yte = train_test_split(Xrest, yrest, test_size=0.5, random_state=0)
### END SOLUTION
print([len(a) for a in (Xtr, Xva, Xte)] if Xtr is not None else None)

# %%
check(lambda: [len(a) for a in (Xtr, Xva, Xte)] == [180, 60, 60], "180 / 60 / 60")

# %% [markdown]
# ## 2. The validation curve
# For degrees 1–15, fit `make_pipeline(PolynomialFeatures(d), LinearRegression())` on train and record the mean
# squared error on train and on validation. Set `train_err`, `val_err` (lists) and `best_d`: the degree with the
# lowest validation error. Plot both curves.

# %%
degrees = range(1, 16)
train_err = val_err = best_d = None
### BEGIN SOLUTION
train_err, val_err = [], []
for d in degrees:
    m = make_pipeline(PolynomialFeatures(d), LinearRegression()).fit(Xtr, ytr)
    train_err.append(np.mean((m.predict(Xtr) - ytr) ** 2)); val_err.append(np.mean((m.predict(Xva) - yva) ** 2))
best_d = list(degrees)[int(np.argmin(val_err))]
plt.plot(degrees, train_err, "o-", label="train"); plt.plot(degrees, val_err, "o-", label="validation")
plt.yscale("log"); plt.xlabel("degree"); plt.legend(); plt.show()
### END SOLUTION
print("best degree:", best_d)

# %%
check(lambda: all(a >= b - 1e-12 for a, b in zip(train_err, train_err[1:])), "training error only goes down as the model grows")
check(lambda: 3 <= best_d <= 9, "validation error is lowest at a moderate degree")

# %% [markdown]
# ## 3. Ridge, tuned by cross-validation
# A degree-15 polynomial overfits; ridge (L2) reins it in. For each `alpha` in `alphas`, compute the 5-fold
# cross-validated MSE on the training set of `make_pipeline(PolynomialFeatures(15), StandardScaler(), Ridge(alpha))`
# with `cross_val_score(..., scoring="neg_mean_squared_error")`. Set `cv_err` and `best_alpha`.

# %%
alphas = [1e-6, 1e-4, 1e-2, 1, 10, 100]
cv_err = best_alpha = None
### BEGIN SOLUTION
cv_err = [-cross_val_score(make_pipeline(PolynomialFeatures(15), StandardScaler(), Ridge(alpha=a)), Xtr, ytr, cv=5,
                           scoring="neg_mean_squared_error").mean() for a in alphas]
best_alpha = alphas[int(np.argmin(cv_err))]
### END SOLUTION
print(dict(zip(alphas, np.round(cv_err, 4))) if cv_err else None, " best:", best_alpha)

# %%
check(lambda: cv_err[int(np.argmin(cv_err))] < cv_err[0] and best_alpha in (1e-2, 1, 10), "some regularization beats none; too much hurts again")

# %% [markdown]
# ## 4. Learning curves
# `learning_curve` refits a model on growing slices of the data. For the degree-15 polynomial with
# `Ridge(alpha=1e-6)` (barely regularized), get train and validation errors at 8 training sizes (5-fold CV over
# all 300 points). Plot them: the gap between the curves is overfitting, and more data closes it.

# %%
sizes = gap_small = gap_big = None
### BEGIN SOLUTION
sizes, tr, va = learning_curve(make_pipeline(PolynomialFeatures(15), StandardScaler(), Ridge(alpha=1e-6)), X, y, cv=5,
                               train_sizes=np.linspace(0.1, 1, 8), scoring="neg_mean_squared_error")
tr_err, va_err = -tr.mean(1), -va.mean(1)
plt.plot(sizes, tr_err, "o-", label="train"); plt.plot(sizes, va_err, "o-", label="validation")
plt.yscale("log"); plt.xlabel("training examples"); plt.legend(); plt.show()
gap_small, gap_big = va_err[0] - tr_err[0], va_err[-1] - tr_err[-1]
### END SOLUTION
print(gap_small, gap_big)

# %%
check(lambda: gap_big < gap_small / 5, "with all the data the train–validation gap shrinks a lot")

# %% [markdown]
# ## 5. Leakage: fooling yourself on pure noise
# 100 examples, 5,000 features of random noise, random labels: nothing can be learned, so honest accuracy is ~50%.
# The **leaky** recipe picks the 20 features most correlated with the labels *using all the data*, then
# cross-validates. The **honest** recipe does the selection inside a pipeline, so each fold picks its features
# from its own training part only. Set `leaky` and `honest` (mean 5-fold accuracy).

# %%
from sklearn.feature_selection import SelectKBest, f_classif
Xn = rng.standard_normal((100, 5000)); yn = rng.integers(0, 2, 100)
leaky = honest = None
### BEGIN SOLUTION
X_sel = SelectKBest(f_classif, k=20).fit_transform(Xn, yn)
leaky = cross_val_score(LogisticRegression(max_iter=1000), X_sel, yn, cv=5).mean()
honest = cross_val_score(make_pipeline(SelectKBest(f_classif, k=20), LogisticRegression(max_iter=1000)), Xn, yn, cv=5).mean()
### END SOLUTION
print("leaky:", leaky, " honest:", honest)

# %%
check(lambda: leaky > 0.7 and honest < 0.65, "leakage reports 70%+ on pure noise; the pipeline tells the truth")

# %% [markdown]
# Any step that looks at the data (scaling, feature selection, filling gaps, picking hyperparameters) must be fit
# on training data only: put it in the pipeline. And the test set from part 1? Touch it once, at the very end.

# %%
if Xtr is not None:
    final = make_pipeline(PolynomialFeatures(best_d or 5), LinearRegression()).fit(np.vstack([Xtr, Xva]), np.concatenate([ytr, yva]))
    print("test MSE, measured once:", np.mean((final.predict(Xte) - yte) ** 2))

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: chapter 12, measuring a model.
