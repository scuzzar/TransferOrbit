# Working on TransferOrbit

- **The domain model in `docs/domain-model.md` leads, always.** The code follows the diagram,
  never the other way round. To change the model, change the diagram first and get the owner's
  agreement, then carry it into the code. Never redraw the diagram to fit what the code does;
  where the code does not follow yet, list it under "Where the code does not follow yet" in that
  file until it is fixed. The diagram's source is `docs/domain-model.puml` (PlantUML); render
  `docs/domain-model.png` again after every change to it.
- `ARCHITECTURE.md` has the two rules the modules follow (imports point downwards; upwards you
  report, you do not call) and the layer table. Keep both true.
- Checks: `npm run typecheck`, `npm run unit`, and with `npm run serve` running, `npm test`.
