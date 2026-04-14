pnpm build                              # build the app first
pnpm -C packages/e2e test               # run all tests (BDD + smoke)
pnpm -C packages/e2e test:bdd           # run only BDD scenarios
pnpm -C packages/e2e test:smoke         # run only smoke test
