# %% [markdown]
# # Practice: build an autograd engine
# *AI from scratch, chapter 4* · lesson: https://ihor.sh/ai/04-backprop.html
#
# Finish a tiny automatic-differentiation engine (in the spirit of Andrej Karpathy's *micrograd*): you write the
# backward rule of each operation, check it against PyTorch, then train a small neural network with it.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).

# %%
import math, random
import numpy as np
import matplotlib.pyplot as plt

# %% [markdown]
# ## 1. The engine
# Each `Value` remembers its parents and a `back_step` that passes blame (its `grad`) to them, multiplied by the
# local slope. `__add__` is done. Write the backward steps for `*` (each input gets the *other* input times
# `out.grad`), `tanh` (slope $1 - t^2$) and `relu` (slope 1 if the input was positive, else 0).
# Use `+=`: a value used twice collects blame from both uses.

# %%
class Value:
    def __init__(self, data, parents=()):
        self.data, self.grad, self.parents = data, 0.0, parents
        self.back_step = lambda: None
    def __repr__(self): return f"Value({self.data:.4f}, grad={self.grad:.4f})"

    def __add__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data + other.data, (self, other))
        def back_step():
            self.grad += out.grad; other.grad += out.grad
        out.back_step = back_step
        return out

    def __mul__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data * other.data, (self, other))
        def back_step():
            ### HINT By product rule, d(self * other)/d(self) = other.data, and d/d(other) = self.data.
            ### HINT Accumulate gradients: self.grad += other.data * out.grad, other.grad += self.data * out.grad.
            ### BEGIN SOLUTION
            self.grad += other.data * out.grad
            other.grad += self.data * out.grad
            ### END SOLUTION
        out.back_step = back_step
        return out

    def tanh(self):
        t = math.tanh(self.data); out = Value(t, (self,))
        def back_step():
            ### HINT By chain rule, d(tanh(x))/dx = 1 - tanh(x)^2 = 1 - t^2.
            ### HINT Accumulate gradient: self.grad += (1 - t * t) * out.grad.
            ### BEGIN SOLUTION
            self.grad += (1 - t * t) * out.grad
            ### END SOLUTION
        out.back_step = back_step
        return out

    def relu(self):
        out = Value(max(0.0, self.data), (self,))
        def back_step():
            ### HINT Derivative of ReLU is 1.0 for x > 0 and 0.0 otherwise.
            ### HINT Accumulate gradient: self.grad += (1.0 if self.data > 0 else 0.0) * out.grad.
            ### BEGIN SOLUTION
            self.grad += (1.0 if self.data > 0 else 0.0) * out.grad
            ### END SOLUTION
        out.back_step = back_step
        return out

    def __pow__(self, n):
        out = Value(self.data ** n, (self,))
        def back_step(): self.grad += n * self.data ** (n - 1) * out.grad
        out.back_step = back_step
        return out

    __radd__ = __add__; __rmul__ = __mul__
    def __neg__(self): return self * -1
    def __sub__(self, other): return self + (-other)

    def backward(self):
        order, seen = [], set()
        def visit(v):
            if v not in seen:
                seen.add(v)
                for p in v.parents: visit(p)
                order.append(v)
        visit(self)
        self.grad = 1.0
        for v in reversed(order): v.back_step()

# %% [markdown]
# ## 2. Check it against PyTorch
# The same expression in both: $L = \text{relu}(a b + c)\,\tanh(a) + a^2$. Every gradient should match.

# %%
import torch
a, b, c = Value(1.5), Value(-0.4), Value(2.0)
L = (a * b + c).relu() * a.tanh() + a ** 2
L.backward()
ta, tb, tc = (torch.tensor(v, dtype=torch.float64, requires_grad=True) for v in (1.5, -0.4, 2.0))
tL = torch.relu(ta * tb + tc) * torch.tanh(ta) + ta ** 2
tL.backward()
print("engine:  ", a.grad, b.grad, c.grad)
print("PyTorch: ", ta.grad.item(), tb.grad.item(), tc.grad.item())

# %%
check(lambda: np.allclose([a.grad, b.grad, c.grad], [ta.grad.item(), tb.grad.item(), tc.grad.item()]), 
      "Your autograd engine's gradients [a.grad, b.grad, c.grad] must match PyTorch's autograd.")

# %% [markdown]
# ## 3. A neuron and a layer
# Write `Neuron(n_in)`: random weights `.w` in (−1, 1) and a bias `.b`, and `__call__(x)` returning
# $\tanh(\sum w_i x_i + b)$ (or ReLU when `act="relu"`). An `MLP` stacks layers of them (given).

# %%
class Neuron:
    def __init__(self, n_in, act="tanh"):
        self.w = [Value(random.uniform(-1, 1)) for _ in range(n_in)]
        self.b = Value(0.0)
        self.act = act
    def __call__(self, x):
        """Compute single neuron forward activation sum(w_i * x_i) + b through tanh or relu.
        
        Args:
            x: List or iterable of scalar inputs (floats or Values).
        Returns:
            Value: Output activation after non-linearity.
        """
        ### HINT Compute weighted sum z = sum(wi * xi) + self.b.
        ### HINT Apply self.act ("relu" or "tanh") to z and return.
        ### BEGIN SOLUTION
        z = sum((wi * xi for wi, xi in zip(self.w, x)), self.b)
        return z.relu() if self.act == "relu" else z.tanh()
        ### END SOLUTION
    def parameters(self): return self.w + [self.b]

class MLP:
    def __init__(self, sizes):
        self.layers = [[Neuron(n_in, "tanh") for _ in range(n_out)] for n_in, n_out in zip(sizes, sizes[1:])]
    def __call__(self, x):
        for layer in self.layers:
            x = [n(x) for n in layer]
        return x[0] if len(x) == 1 else x
    def parameters(self): return [p for layer in self.layers for n in layer for p in n.parameters()]

random.seed(0)
net = MLP([2, 8, 8, 1])
print(len(net.parameters()), "parameters")

# %%
check(lambda: isinstance(net([0.5, -0.2]), Value) and -1 < net([0.5, -0.2]).data < 1, 
      "A forward pass through the MLP should produce a single Value object with data in range (-1, 1).")

# %% [markdown]
# ## 4. Train it on two moons
# 100 points in two interleaved half-moons, labels −1 and +1. Train for 100 steps on the **mean** squared error:
# compute the average loss over the points, zero every parameter's `grad`, `backward()`, then move each parameter
# `0.5 * grad` downhill. (Summing instead of averaging multiplies every gradient by 100, which is the same as a
# 100× bigger learning rate: training would bounce around.) Set `acc` to the share of points whose prediction has
# the right sign. It takes about 10 seconds: pure-Python numbers are slow, which is what tensors fix.

# %%
from sklearn.datasets import make_moons
Xm, ym = make_moons(100, noise=0.1, random_state=1)
ym = ym * 2 - 1
acc, losses = None, []
### HINT For each of 100 steps: Forward pass: compute predictions preds = [net(list(x)) for x in Xm]. Compute MSE loss: L = sum((p - y)**2) * (1 / len(ym)). Zero grads: for p in net.parameters(): p.grad = 0.0. Backward pass: L.backward(). Update weights: for p in net.parameters(): p.data -= 0.5 * p.grad.
### HINT Compute accuracy as fraction of predictions matching the sign of ym.
### BEGIN SOLUTION
for step in range(100):
    preds = [net(list(x)) for x in Xm]
    L = sum(((p - y) ** 2 for p, y in zip(preds, ym)), Value(0.0)) * (1 / len(ym))
    for p in net.parameters(): p.grad = 0.0
    L.backward()
    for p in net.parameters(): p.data -= 0.5 * p.grad
    losses.append(L.data)
acc = np.mean([(net(list(x)).data > 0) == (y > 0) for x, y in zip(Xm, ym)])
### END SOLUTION
plt.plot(losses); plt.title("loss"); plt.show()
print("accuracy:", acc)

# %%
check(lambda: acc >= 0.95, 
      "The trained micrograd MLP should achieve at least 95% classification accuracy on the two moons dataset.")

# %% [markdown]
# ## 5. Look at what it learned
# The decision regions: blue where the network says −1, red where it says +1.

# %%
if acc is not None:
    xx, yy = np.meshgrid(np.linspace(-1.5, 2.5, 50), np.linspace(-1, 1.5, 50))
    zz = np.array([net([a, b]).data for a, b in zip(xx.ravel(), yy.ravel())]).reshape(xx.shape)
    plt.contourf(xx, yy, zz > 0, alpha=0.3, cmap="coolwarm"); plt.scatter(Xm[:, 0], Xm[:, 1], c=ym, cmap="coolwarm", s=15); plt.show()

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Andrej Karpathy's free video "The spelled-out intro to neural networks and
# backpropagation: building micrograd" builds this same engine step by step.
