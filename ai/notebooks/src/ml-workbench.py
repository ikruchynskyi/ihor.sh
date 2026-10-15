# %% [markdown]
# # Practice: your ML workbench
# *AI from scratch, toolkit 0* · lesson: https://ihor.sh/ai/ml-workbench.html
#
# Practice the tools you need on day one: running shell commands, creating an isolated git repository,
# staging and committing snapshots, branching for experiments, inspecting diffs, reverting mistakes, and
# writing a `.gitignore` that keeps multi-gigabyte model weights out of your repo.
# Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)`
# are there when you're stuck.

# %%
import os, subprocess, tempfile
from pathlib import Path

def sh(cmd, cwd=None):
    "Run a shell command and return its combined stdout and stderr."
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd)
    return r.stdout + (("\n" + r.stderr) if r.stderr else "")

# %% [markdown]
# ## 1. Running commands in the shell
# In automation pipelines and Colab/Kaggle environments, shell commands can be executed directly.
# Call `sh("git --version")` and assign the returned string to `git_ver`.

# %%
### HINT Call sh with 'git --version'
### HINT git_ver = sh("git --version")
### BEGIN SOLUTION
git_ver = sh("git --version")
### END SOLUTION

# %%
check(lambda: "git version" in str(git_ver).lower(), "git --version returns git's version string")

# %% [markdown]
# ## 2. Initializing a repository
# We create an isolated sandbox directory `repo_dir` for our project.
# Run `git init` inside `repo_dir` using `sh("git init", cwd=repo_dir)` and store the output in `out_init`.

# %%
repo_dir = Path(tempfile.mkdtemp(prefix="ml_workbench_repo_"))
sh("git config --global user.email 'learner@example.com'")
sh("git config --global user.name 'ML Learner'")

### HINT Run git init in repo_dir using cwd=repo_dir
### HINT out_init = sh("git init", cwd=repo_dir)
### BEGIN SOLUTION
out_init = sh("git init", cwd=repo_dir)
### END SOLUTION

# %%
check(lambda: (repo_dir / ".git").is_dir(), "git init creates the hidden .git repository directory")

# %% [markdown]
# ## 3. Staging changes: git add
# We write a starting baseline script `train.py`.
# Stage the file for the next commit by running `git add train.py` in `repo_dir`, assigning output to `out_add`.

# %%
(repo_dir / "train.py").write_text("print('baseline model')\n")

### HINT Run git add train.py in repo_dir
### HINT out_add = sh("git add train.py", cwd=repo_dir)
### BEGIN SOLUTION
out_add = sh("git add train.py", cwd=repo_dir)
### END SOLUTION

# %%
check(lambda: "A  train.py" in sh("git status --short", cwd=repo_dir), "git add moves train.py into the staging index")

# %% [markdown]
# ## 4. Committing a snapshot: git commit
# Take a permanent snapshot of the staged code with a descriptive commit message.
# Run `git commit -m "Initial baseline"` in `repo_dir` and assign the result to `out_commit`.

# %%
### HINT Run git commit -m 'Initial baseline' in repo_dir
### HINT out_commit = sh("git commit -m 'Initial baseline'", cwd=repo_dir)
### BEGIN SOLUTION
out_commit = sh("git commit -m 'Initial baseline'", cwd=repo_dir)
### END SOLUTION

# %%
check(lambda: "Initial baseline" in sh("git log --oneline", cwd=repo_dir), "git commit records a permanent snapshot into repository history")

# %% [markdown]
# ## 5. Branching for experiments
# Never hack risky ideas directly onto your main branch.
# Create and check out a new branch named `try-adam` by running `git checkout -b try-adam` in `repo_dir`.

# %%
### HINT Run git checkout -b try-adam in repo_dir
### HINT out_branch = sh("git checkout -b try-adam", cwd=repo_dir)
### BEGIN SOLUTION
out_branch = sh("git checkout -b try-adam", cwd=repo_dir)
### END SOLUTION

# %%
check(lambda: "* try-adam" in sh("git branch", cwd=repo_dir), "git checkout -b creates and activates the new branch")

# %% [markdown]
# ## 6. Inspecting unstaged diffs: git diff
# We edit `train.py` with an experimental optimizer.
# Inspect the unstaged differences in the working tree by running `git diff` in `repo_dir` and saving to `out_diff`.

# %%
(repo_dir / "train.py").write_text("print('baseline model with Adam optimizer lr=0.001')\n")

### HINT Run git diff without --staged to inspect working tree edits
### HINT out_diff = sh("git diff", cwd=repo_dir)
### BEGIN SOLUTION
out_diff = sh("git diff", cwd=repo_dir)
### END SOLUTION

# %%
check(lambda: "+print('baseline model with Adam optimizer lr=0.001')" in str(out_diff), "git diff shows line additions and removals in the working tree")

# %% [markdown]
# ## 7. Undoing mistakes: git restore
# Suppose the experiment failed and you want to discard your unstaged edits completely.
# Run `git restore train.py` in `repo_dir` to bring the file back to the clean committed state.

# %%
### HINT Run git restore train.py in repo_dir
### HINT out_restore = sh("git restore train.py", cwd=repo_dir)
### BEGIN SOLUTION
out_restore = sh("git restore train.py", cwd=repo_dir)
### END SOLUTION

# %%
check(lambda: (repo_dir / "train.py").read_text() == "print('baseline model')\n", "git restore discards unstaged changes and restores the committed version")

# %% [markdown]
# ## 8. Protecting the repo: .gitignore
# Heavy model weights and virtual environments must never enter git.
# Write a `.gitignore` file inside `repo_dir` that ignores `.venv/`, `*.pt`, and `__pycache__/`.

# %%
### HINT Write a string with .venv/, *.pt, and __pycache__/ on separate lines to repo_dir / '.gitignore'
### HINT gitignore_text = '.venv/\n*.pt\n__pycache__/\n'
### BEGIN SOLUTION
gitignore_text = ".venv/\n*.pt\n__pycache__/\n"
(repo_dir / ".gitignore").write_text(gitignore_text)
### END SOLUTION

# %%
(repo_dir / "model_weights.pt").write_bytes(b"100MB of binary tensor weights")
(repo_dir / ".venv").mkdir(exist_ok=True)
(repo_dir / ".venv" / "pyvenv.cfg").write_text("home = /usr/bin\n")
status_lines = sh("git status --porcelain", cwd=repo_dir)
check(lambda: "model_weights.pt" not in status_lines and ".venv" not in status_lines and ".gitignore" in status_lines, ".gitignore excludes heavy weights and virtualenvs while tracking .gitignore itself")
