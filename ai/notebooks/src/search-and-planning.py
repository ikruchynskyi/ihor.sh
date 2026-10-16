# %% [markdown]
# # Practice: search, planning and constraints
# *AI from scratch, elective* · lesson: https://ihor.sh/ai/search-and-planning.html
#
# Finding optimal paths through graphs with A* and admissible heuristics, pruning game trees with α-β minimax, and
# solving constraint satisfaction problems with forward checking. Replace each `...` under `# YOUR CODE HERE`, run
# the cell, then the check under it; `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import heapq
import math

# %% [markdown]
# ## 1. An admissible heuristic
# A train destination is 30 miles away in a straight line, and the maximum allowed train speed anywhere on the
# network is 60 mph (1 mile per minute). Set `h_mins` to the straight-line travel time in minutes (`distance / speed * 60`).

# %%
h_mins = None
### HINT 30 / 60 * 60
### BEGIN SOLUTION
h_mins = 30 / 60 * 60
### END SOLUTION
print("Admissible heuristic:", h_mins, "minutes")

# %%
check(lambda: h_mins is not None and abs(h_mins - 30.0) < 1e-5,
      "30 miles ÷ 60 mph = 0.5 hours = 30 minutes: never overestimates actual track time")

# %% [markdown]
# ## 2. Priority queue with heapq
# In Uniform-Cost Search, frontier stations are stored in a priority queue using `heapq.heappush` and `heapq.heappop`.
# Push the three candidate stations `("White Plains", 22)`, `("Yonkers", 14)`, and `("New Rochelle", 18)` as
# `(cost, station)` tuples onto `frontier = []`, then pop the cheapest one into `best_cost, best_station`.

# %%
frontier = []
best_cost, best_station = None, None
### HINT for station, cost in [("White Plains", 22), ("Yonkers", 14), ("New Rochelle", 18)]: heapq.heappush(frontier, (cost, station))
### HINT best_cost, best_station = heapq.heappop(frontier)
### BEGIN SOLUTION
for station, cost in [("White Plains", 22), ("Yonkers", 14), ("New Rochelle", 18)]:
    heapq.heappush(frontier, (cost, station))
best_cost, best_station = heapq.heappop(frontier)
### END SOLUTION
print("Cheapest station popped:", best_station, "with cost", best_cost)

# %%
check(lambda: best_station == "Yonkers" and best_cost == 14,
      "heapq pops (14, 'Yonkers') first: lowest cumulative cost so far")

# %% [markdown]
# ## 3. A* evaluation function f(s) = g(s) + h(s)
# A train is at Harlem-125th with cumulative cost `g = 10` minutes. Stepping to New Rochelle has action cost
# `step_cost = 18`. The straight-line heuristic from New Rochelle to the goal (Stamford) is `h_val = 22`.
# Compute `f_score = g + step_cost + h_val` for New Rochelle.

# %%
g = 10
step_cost = 18
h_val = 22
f_score = None
### HINT f_score = g + step_cost + h_val
### BEGIN SOLUTION
f_score = g + step_cost + h_val
### END SOLUTION
print("Total evaluation score f:", f_score)

# %%
check(lambda: f_score == 50, "f = 10 + 18 + 22 = 50: cost so far plus estimated cost to go")

# %% [markdown]
# ## 4. Alpha-beta pruning cutoff
# In minimax search, MIN updates `beta = min(beta, child_val)`. If `beta <= alpha`, the maximizing parent node
# will never choose this branch, so the search can stop exploring remaining children.
# Complete the cutoff condition inside the loop: if `beta <= alpha`, break out of the loop.

# %%
alpha = 5
beta = 7
children_values = [6, 2, 9, 8]
visited_count = 0

for val in children_values:
    visited_count += 1
    beta = min(beta, val)
    ### HINT if beta <= alpha: break
    ### BEGIN SOLUTION
    if beta <= alpha:
        break
    ### END SOLUTION

print("Visited children:", visited_count, "out of", len(children_values))

# %%
check(lambda: visited_count == 2,
      "After seeing val=2, beta becomes 2 <= alpha (5), pruning the remaining 2 children")

# %% [markdown]
# ## 5. Forward checking in a CSP
# In a Constraint Satisfaction Problem, assigning `assigned_val = 2` to a rail line means its adjacent neighbor
# cannot use that time slot. Filter `neighbor_domain = [1, 2, 3]` by keeping only elements `x != assigned_val`.

# %%
assigned_val = 2
neighbor_domain = [1, 2, 3]
### HINT neighbor_domain = [x for x in neighbor_domain if x != assigned_val]
### BEGIN SOLUTION
neighbor_domain = [x for x in neighbor_domain if x != assigned_val]
### END SOLUTION
print("Remaining allowed slots for neighbor:", neighbor_domain)

# %%
check(lambda: neighbor_domain == [1, 3],
      "Forward checking pruned 2, leaving [1, 3] in the neighbor's domain")
