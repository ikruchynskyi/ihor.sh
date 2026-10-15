# %% [markdown]
# # Practice: reinforcement learning
# *AI from scratch, elective* · lesson: https://ihor.sh/ai/reinforcement-learning.html
#
# Discounted returns by hand, Q-learning on a slippery grid with and without exploration, then a policy-gradient agent
# (REINFORCE) that learns to balance a pole on a cart in a few seconds. Replace each `...` under `# YOUR CODE HERE`, run
# the cell, then the check under it; `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import subprocess, sys
import numpy as np
import matplotlib.pyplot as plt
import torch
from torch import nn
try:
    import gymnasium as gym
except ImportError:                                   # Colab and Kaggle usually have it; elsewhere, install it
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "gymnasium"]); import gymnasium as gym

# %% [markdown]
# ## 1. A discounted return
# Rewards −1, −1, then +10 (two steps, then the station), with γ = 0.9. Set `G`: r₁ + γ r₂ + γ² r₃.

# %%
G = None
### HINT -1 + 0.9 * (-1) + 0.9 ** 2 * 10
### BEGIN SOLUTION
G = -1 + 0.9 * -1 + 0.9 ** 2 * 10
### END SOLUTION
print(G)

# %%
check(lambda: abs(G - 6.2) < 1e-9, "−1 − 0.9 + 8.1 = 6.2: the +10 two steps away counts 0.81 of its face value")

# %% [markdown]
# ## 2. Q-learning on a slippery grid
# A 5 × 5 grid; start at the top-left, a goal worth +10 at the bottom-right, −1 per step, and 10% of moves go in a
# random direction (`step` is given). Write the Q-learning update inside `q_learning`: move `Q[s, a]` a fraction
# `alpha` toward the target `r + gamma * max(Q[s2])`, with no future value when `done`.

# %%
N, GOAL = 5, 24
MOVES = [(-1, 0), (0, 1), (1, 0), (0, -1)]                       # up, right, down, left as (row, col) steps
def step(s, a, rng):
    move = MOVES[rng.integers(4)] if rng.random() < 0.1 else MOVES[a]
    r, c = divmod(s, N); r, c = min(N - 1, max(0, r + move[0])), min(N - 1, max(0, c + move[1]))
    s2 = r * N + c
    return s2, (10 if s2 == GOAL else -1), s2 == GOAL

def q_learning(episodes=500, eps=0.1, alpha=0.3, gamma=0.95, seed=0):
    rng, Q, returns = np.random.default_rng(seed), np.zeros((N * N, 4)), []
    for _ in range(episodes):
        s, total = 0, 0
        for t in range(100):
            a = rng.integers(4) if rng.random() < eps else int(np.argmax(Q[s]))
            s2, r, done = step(s, a, rng)
            ### HINT target = r + (0 if done else gamma * Q[s2].max())
            ### HINT Q[s, a] += alpha * (target - Q[s, a])
            ### BEGIN SOLUTION
            target = r + (0 if done else gamma * Q[s2].max())
            Q[s, a] += alpha * (target - Q[s, a])
            ### END SOLUTION
            s, total = s2, total + r
            if done:
                break
        returns.append(total)
    return Q, returns

Q, returns = q_learning()
print("value at the start:", Q[0].max().round(2), "· average return of the last 100 episodes:", np.mean(returns[-100:]).round(2))
print(np.round(Q.max(axis=1).reshape(N, N), 1))

# %%
check(lambda: 0 < Q[0].max() < 2 and np.mean(returns[-100:]) > 0,
      "about +1 at the start: 8 steps to the goal, 10·0.95⁷ ≈ 7 minus about 6 of discounted step costs; recent episodes average near the best possible +3, less the slips")

# %% [markdown]
# ## 3. A small reward nearby
# Now the grid has two exits: a coffee cart two steps below the start (+3, ends the episode) and the far corner (+20).
# With γ = 0.95 the far corner is worth much more from the start (about 8 against 2), but the agent has to find it.
# `explore_run(eps)` (given) trains for 2,000 episodes and reports which exit the final greedy policy takes, for 6
# seeds. **Predict** first: with ε = 0.1, how many of the 6 runs find the far corner? Set `guess_far_01`.

# %%
NEAR = 10                                                     # row 2, column 0: two steps down
def step2(s, a, rng, slip=0.1):
    move = MOVES[rng.integers(4)] if rng.random() < slip else MOVES[a]
    r, c = divmod(s, N); r, c = min(N - 1, max(0, r + move[0])), min(N - 1, max(0, c + move[1]))
    s2 = r * N + c
    if s2 == GOAL:
        return s2, 20, True
    if s2 == NEAR:
        return s2, 3, True
    return s2, -1, False
def explore_run(eps, episodes=2000, alpha=0.3, gamma=0.95):
    found = 0
    for seed in range(6):
        rng, Q2 = np.random.default_rng(seed), np.zeros((N * N, 4))
        for _ in range(episodes):
            s = 0
            for t in range(100):
                a = rng.integers(4) if rng.random() < eps else int(np.argmax(Q2[s]))
                s2, r, done = step2(s, a, rng)
                Q2[s, a] += alpha * (r + (0 if done else gamma * Q2[s2].max()) - Q2[s, a]); s = s2
                if done:
                    break
        s = 0
        for t in range(50):                                   # the learned policy, no slips
            s, r, done = step2(s, int(np.argmax(Q2[s])), rng, slip=0)
            if done:
                found += s == GOAL
                break
    return found

guess_far_01 = None
### HINT The coffee cart is reached by accident in the first episodes and makes "down" look good right away; random moves are only 10%.
### BEGIN SOLUTION
guess_far_01 = 0
### END SOLUTION

# %%
far = {eps: explore_run(eps) for eps in [0.1, 0.5]}
print("runs (of 6) whose final policy goes to the +20 corner:", far)
check(lambda: guess_far_01 == far[0.1] and far[0.5] > far[0.1],
      "ε = 0.1 settles for the nearby +3 every time; ε = 0.5 finds the better +20, after 2,000 episodes: exploration is expensive and necessary")

# %% [markdown]
# ## 4. Returns-to-go for a policy gradient
# REINFORCE weights each action's log-probability by the return *from that step on*. Write `returns_to_go(rewards,
# gamma)`: walk the rewards backward, `G = r + gamma * G`, and collect each `G` (then reverse the list).

# %%
def returns_to_go(rewards, gamma=0.99):
    out, G = [], 0.0
    ### HINT for r in reversed(rewards): G = r + gamma * G; out.append(G)
    ### HINT return out[::-1]
    ### BEGIN SOLUTION
    for r in reversed(rewards):
        G = r + gamma * G
        out.append(G)
    return out[::-1]
    ### END SOLUTION

# %%
check(lambda: np.allclose(returns_to_go([1, 1, 1], 0.5), [1.75, 1.5, 1.0]), "from the last step back: 1, then 1 + 0.5·1, then 1 + 0.5·1.5")

# %% [markdown]
# ## 5. Balance the pole
# CartPole: push a cart left or right to keep a pole upright; +1 for every step it stays up, at most 500. The policy is
# a small network giving the two actions' probabilities (given), and so is the episode loop. Write the loss: minus the
# sum of each step's log-probability times its normalized return-to-go (`R`, given).

# %%
env = gym.make("CartPole-v1"); torch.manual_seed(0)
policy = nn.Sequential(nn.Linear(4, 64), nn.Tanh(), nn.Linear(64, 2))
opt = torch.optim.Adam(policy.parameters(), lr=1e-2)
lengths = []
for ep in range(300):
    obs, _ = env.reset(seed=ep); logps, rewards = [], []
    while True:
        dist = torch.distributions.Categorical(logits=policy(torch.tensor(obs, dtype=torch.float32)))
        a = dist.sample(); logps.append(dist.log_prob(a))
        obs, r, terminated, truncated, _ = env.step(a.item()); rewards.append(r)
        if terminated or truncated:
            break
    rtg = returns_to_go(rewards) or [0.0] * len(rewards)
    R = torch.tensor(rtg); R = (R - R.mean()) / (R.std() + 1e-8)        # normalized: a baseline that cuts the noise
    loss = None
    ### HINT loss = -(torch.stack(logps) * R).sum()
    ### BEGIN SOLUTION
    loss = -(torch.stack(logps) * R).sum()
    ### END SOLUTION
    if loss is not None:
        opt.zero_grad(); loss.backward(); opt.step()
    lengths.append(len(rewards))
plt.plot(lengths); plt.xlabel("episode"); plt.ylabel("steps balanced (max 500)"); plt.show()
print("first 20 episodes:", np.mean(lengths[:20]).round(1), "· last 50:", np.mean(lengths[-50:]).round(1))

# %%
check(lambda: np.mean(lengths[-50:]) > 300, "from a few dozen steps to hundreds: actions that came before long balances got more likely")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · OpenAI, "Spinning Up in Deep RL": https://spinningup.openai.com/
