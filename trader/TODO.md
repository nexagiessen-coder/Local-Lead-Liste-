# Day-trading experiment — ON HOLD

Paused on 2026-11-18 after Phase 0 (setup check). No trades have been made.
Nothing is connected to a broker. `trader/config.json` is still on paper with
the original $23 limits.

## What you still have to do

1. **Start the next session on branch `claude/busy-hamilton-sas980`** (or merge
   it into main first). The trader skills and this config only exist there.
2. **Paper budget:** say yes to $2,500 (max loss $100 per trade, $250 per day),
   or keep $23 and trade only $5–$17 stocks. The config still has $23.
3. **SEC user agent:** give your name and email. Until then, news uses Yahoo
   headlines only, with no SEC filings.
4. **Broker for paper trading**, pick one:
   - **A:** simulated paper in the cloud session. Claude logs fills at Yahoo
     prices, which is optimistic.
   - **B:** real Alpaca paper account in Claude Desktop. Make an Alpaca account,
     create paper keys, install `uv`, add Alpaca's server to the Claude Desktop
     config (keys only in that file, never in chat), and set `place_stock_order`
     to "Needs approval". Steps: `.claude/skills/trader-broker/SKILL.md`.
5. **pdt_guard:** on or off. With it on you get at most 3 trades per
   5 business days. A cash account doesn't need it.
6. **Be in the session on a weekday before 15:30 German time**, so Phase 1 runs
   before the open and you are there to say yes to each order.

## Later, before any real money

- Paper trade until you have at least 30 trades (about 4–6 weeks), not 10 days.
- Go live only if the average R is positive. Start with about €870 ($1,000),
  money you can afford to lose. Stop and review if it drops to $800.
- Going live needs a funded Alpaca live account set up by you in Claude
  Desktop, then "GO LIVE" in chat so Claude sets `"paper": false`.
