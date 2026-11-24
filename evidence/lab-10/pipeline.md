# Lab 10: production deploys only from main, after CI

## The first deployment (PR #20, branch lab-10-a-vercel-json): promoted before CI, from a PR branch (DELIV-002)

Vercel deployment dpl_28Es1oYHAjmeRWQrrzPoupCuArMp: target=production, readySubstate=PROMOTED, githubCommitRef=lab-10-a-vercel-json, githubPrId=20. Project production branch: main.
- Vercel created 2026-11-24T12:56:44Z, ready and promoted 2026-11-24T12:57:44Z, aliases tidewater-bice.vercel.app, tidewater-geekiodevs-projects.vercel.app
- CI run 45398429441 on the same commit: started 12:56:48Z, finished 12:58:25Z, success
=> production served a PR branch 41 s before CI finished. It was the project's first Git deployment, made just after the Git connection; content identical to what merge A shipped.

## Merge A on main (177aead): held until CI passed
```
2026-11-24T12:59:47Z {"uid":"dpl_3PuUbbX8f7fPqx8YrVVnuApAn64X","target":"production","state":"BUILDING","readySubstate":null} | ci 177aead in_progress 
2026-11-24T13:00:11Z {"uid":"dpl_3PuUbbX8f7fPqx8YrVVnuApAn64X","target":"production","state":"READY","readySubstate":"STAGED"} | ci 177aead in_progress 
2026-11-24T13:01:33Z {"uid":"dpl_3PuUbbX8f7fPqx8YrVVnuApAn64X","target":"production","state":"READY","readySubstate":"STAGED"} | ci 177aead completed success
2026-11-24T13:01:44Z {"uid":"dpl_3PuUbbX8f7fPqx8YrVVnuApAn64X","target":"production","state":"READY","readySubstate":"PROMOTED"} | ci 177aead completed success
```

## Merge B on main (5d28546): held until CI passed
```
2026-11-24T15:39:20Z PR B merged
2026-11-24T15:39:25Z bad-line-live=0 | dpl_Byo4p8SA8dftdGPDwJc8bh1uWoB7 BUILDING null
2026-11-24T15:39:54Z bad-line-live=0 | dpl_Byo4p8SA8dftdGPDwJc8bh1uWoB7 READY STAGED
2026-11-24T15:41:27Z bad-line-live=0 | dpl_Byo4p8SA8dftdGPDwJc8bh1uWoB7 READY PROMOTED
```

Redeploys of an existing main commit (vercel redeploy, used to apply env changes) are promoted directly: there is no new commit for CI to check.
