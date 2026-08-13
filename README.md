# Braess Lab

Braess Lab is an interactive web app that functions as a companion to *Braess' Paradox in Uniform Affine Grid Networks*, a research paper by Andy Lu and Steven J. Miller.

**Live demo:** https://anlu9183.github.io/braess-lab/

## About

Braess' paradox occurs when adding a new road to a network makes the equilibrium travel time worse. This app lets you experiment with the networks studied in the paper and see the paradox visually.

The main grid sandbox uses a uniform affine grid with latency

[
\ell(x)=ax+b
]

on each road. You can add a directed shortcut, change its parameters, and see how the equilibrium flow and Braess ratio change.

## Features

* Build and explore uniform grid networks
* Add or remove directed shortcuts
* View equilibrium flow, edge latency, and node potentials
* Compare the network before and after adding a shortcut
* Plot quantities used in the paper's analysis
* Explore examples from the paper
* Build small custom directed networks in the free-form sandbox
* Search across grid sizes and shortcut locations for large Braess ratios

The grid solver implements the mathematical framework developed in the paper. The free-form network mode uses a numerical Frank-Wolfe solver.

## Running locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open the local address shown in the terminal.

To run the tests:

```bash
npm test
```

## Research

The app was built to visualize the results of the paper and to experiment with questions that are harder to see from the equations alone. In particular, the search tool can compare shortcut locations across different grid sizes and investigate how large the Braess ratio can become.

The paper studies uniform affine grid networks theoretically; the free-form sandbox is included for experimentation and is not meant to model real traffic networks.

## License

MIT License. See `LICENSE`.
