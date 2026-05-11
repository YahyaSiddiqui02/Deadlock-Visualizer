import json

cells = []

def add_markdown(text):
    cells.append({
        "cell_type": "markdown",
        "metadata": {},
        "source": [line + "\n" for line in text.strip().split("\n")]
    })

def add_code(text):
    cells.append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [line + "\n" for line in text.strip().split("\n")]
    })

# 1. Overview
add_markdown("""
# Deadlock Detection and Recovery Simulator
---
## 1. Overview
The **Deadlock Detection and Recovery Simulator** is an interactive educational tool designed to simulate dynamic resource allocation, visualize the Resource Allocation Graph (RAG), and enforce safe system operations. 

It implements classical operating system concepts including the **Banker's Algorithm** for safety checking, **Cycle Detection** in RAGs for deadlock identification, and practical **Recovery Strategies** to return the system to a functional state.
""")

# 2. Objectives
add_markdown("""
## 2. Objectives
1. **Simulate dynamic resource allocation** using Allocation and Request matrices.
2. **Construct and display** the Resource Allocation Graph (RAG) graphically.
3. **Implement Banker's Algorithm** to determine if a system is in a safe or unsafe state.
4. **Implement Deadlock Detection** algorithm using cycle detection in the RAG.
5. **Simulate Recovery strategies** including process termination and resource preemption.
""")

# 3. Theory
add_markdown("""
## 3. Theory
Deadlock is one of the most critical problems in concurrent operating systems. It occurs when two or more processes are waiting indefinitely for an event that can only be caused by one of the waiting processes. This simulator allows students to interact with various deadlock scenarios dynamically, observe how the system transitions between safe and unsafe states, and test different recovery approaches.
""")

# Banker's Safety Algorithm
add_markdown("""
### 3.1 Banker's Safety Algorithm
The Safety Algorithm determines if the current state of the system has at least one safe sequence of execution where all processes can complete without deadlocking.

**Algorithm:**
1. Let `Work` and `Finish` be vectors of length `m` (resources) and `n` (processes).
   - Initialize: `Work = Available`
   - Initialize: `Finish[i] = false` for `i = 0, 1, ..., n-1`
2. Find an `i` such that both:
   - `Finish[i] == false`
   - `Need_i <= Work`
   If no such `i` exists, go to step 4.
3. `Work = Work + Allocation_i`
   `Finish[i] = true`
   Go to step 2.
4. If `Finish[i] == true` for all `i`, then the system is in a **safe state**.
""")

# Resource Request Algorithm
add_markdown("""
### 3.2 Resource Request Algorithm
When a process `P_i` requests resources, this algorithm determines if the request can be safely granted.

**Algorithm:**
1. If `Request_i <= Need_i`, go to step 2. Otherwise, raise an error (process exceeded maximum claim).
2. If `Request_i <= Available`, go to step 3. Otherwise, `P_i` must wait (resources unavailable).
3. Pretend to allocate requested resources to `P_i` by modifying the state:
   - `Available = Available - Request_i`
   - `Allocation_i = Allocation_i + Request_i`
   - `Need_i = Need_i - Request_i`
4. Run the **Safety Algorithm**.
   - If safe, the resources are allocated to `P_i`.
   - If unsafe, restore the old resource allocation state and `P_i` must wait.
""")

# Cycle Detection
add_markdown("""
### 3.3 Cycle Detection (Resource Allocation Graph)
The deadlock detection algorithm uses Depth-First Search (DFS) to detect cycles in the Resource Allocation Graph (RAG).

**Algorithm:**
1. Construct the RAG with Processes (`P`) and Resources (`R`) as nodes.
2. Add directed edges:
   - **Assignment Edge:** `R_j -> P_i` (Resource `j` allocated to Process `i`)
   - **Request Edge:** `P_i -> R_j` (Process `i` requesting Resource `j`)
3. Initialize a `visited` array and a `recursion_stack` array to track nodes.
4. For each node in the graph:
   - Perform DFS.
   - If an adjacent node is currently in the `recursion_stack`, a **cycle is detected**, indicating a deadlock state involving those processes.
""")

# Recovery Strategies
add_markdown("""
### 3.4 Recovery Strategies
Once deadlock is detected, the system must recover to resume normal operations.

**Strategy A: Process Termination (Abort)**
- Abort all deadlocked processes.
- **OR:** Abort one deadlocked process at a time until the deadlock cycle is eliminated. (Simulator targets the process with the least priority).

**Strategy B: Resource Preemption**
- Preempt resources from the process holding the most resources and give them to waiting processes until the deadlock is resolved.
""")

# 4. System Modules
add_markdown("""
## 4. System Modules

### Module 1 — Resource Allocation Graph:
* **Graphical Representation:** Visualization of processes (circles) and resources (squares).
* **Display Elements:** Allocation edges (resource → process) and request edges (process → resource).

### Module 2 — Banker's Algorithm Module:
* **Input:** Allocation matrix, Maximum matrix, Available vector.
* **Output:** Need matrix, Safe sequence (if it exists).

### Module 3 — Deadlock Detection Module:
* Run the cycle detection algorithm on the current state.
* Identify and explicitly display the subset of deadlocked processes.

### Module 4 — Recovery Module:
* **Strategy A:** Terminate the deadlocked process with the least priority.
* **Strategy B:** Preempt resources from the process holding the most.
* Visually and logically show the system state after each recovery step.
""")

# 5. CO Mapping & Evaluation
add_markdown("""
## 5. CO Mapping & Evaluation

| CO | Activity | Bloom's Level | Marks |
|---|---|---|---|
| **CO2** | Explain Banker's Algorithm and deadlock conditions | L2 Understand | 10 |
| **CO3** | Implement Banker's Algorithm and detection algorithm | L3 Apply | 25 |
| **CO4** | Analyze state transitions between safe and unsafe states | L4 Analyze | 20 |
| **CO5** | Evaluate recovery strategies for given deadlock scenarios | L5 Evaluate | 15 |
| **CO6** | Design complete simulator with RAG visualization | L6 Create | 10 |
| **—** | Documentation and Viva | — | 20 |
| | **TOTAL** | | **100** |
""")

# 6. Procedure
add_markdown("""
## 6. Procedure
1. **Design data structures** for Allocation, Max, Available, and Need matrices.
2. **Implement the RAG drawing module** (nodes and directed edges).
3. **Implement Banker's Algorithm** with step-by-step trace output to console/UI.
4. **Implement the cycle-detection algorithm** for deadlock detection.
5. **Build the recovery simulation module** enabling both recovery strategies.
6. **Test with various scenarios** (deadlock scenarios and safe-state scenarios).
7. **Document analysis:** compare prevention vs avoidance vs detection.
""")

# 7. Expected Output
add_markdown("""
## 7. Expected Output
* **Safe state:** System is SAFE — Safe Sequence: `P1 → P3 → P2 → P4 → P0`
* **Unsafe state:** DEADLOCK DETECTED — Deadlocked processes: `{P0, P2}`
* **Recovery Log:** Detailed output showing resource release steps and state transitions.
* **Visual Output:** Visual RAG before and after recovery actions.
""")

# 8. Future Enhancements
add_markdown("""
## 8. Future Enhancements
* Add a **graphical, interactive RAG** with drag-and-drop capabilities for process/resource nodes.
* Extend detection logic to **multi-instance resources** with full wait-for-graph detection mechanisms.
* Simulate **rollback-based recovery** (restoring a previous safe state via checkpoints).
""")

notebook = {
    "cells": cells,
    "metadata": {
        "language_info": {
            "name": "python"
        }
    },
    "nbformat": 4,
    "nbformat_minor": 5
}

with open("Deadlock_Simulator_Documentation.ipynb", "w", encoding="utf-8") as f:
    json.dump(notebook, f, indent=4)

print("Jupyter Notebook created successfully!")
