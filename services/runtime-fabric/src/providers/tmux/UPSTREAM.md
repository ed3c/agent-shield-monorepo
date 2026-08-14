# tmux upstream evidence boundary

Observed official source subject:

```text
repository:       https://github.com/tmux/tmux
release:          tmux 3.7b
published:        2026-07-01
annotated tag:    3423e0dcc6ec1069d575cd104ed1c005e3e3943f
source commit:    e802909de06012a4df6209d55e86487c56223163
archive:          tmux-3.7b.tar.gz
archive SHA-256:  87f2e99e3b685973f2ca002ffd6ed7e51a5744f7009daae5a15670b6d532db96
license:          ISC
```

The annotated Git tag is reported unsigned, and the GitHub release object is not an immutable-release object. The repository therefore treats the exact commit and observed archive digest as source inputs, not as an admitted executable or provenance attestation.

The exact README states that tmux is a terminal multiplexer, can be detached while continuing in the background, and can later be reattached. It also lists libevent 2.x and ncurses as dependencies. Those direct and transitive build/runtime subjects require a separate exact artifact/SBOM/notice admission before a portable Worker image can claim live tmux evidence.

Repository decisions:

- use fixed tmux subcommands and argv arrays only;
- map a typed task envelope to a fixed sandbox task runner;
- never expose generic shell-over-MCP, caller-selected command/cwd, or unauthenticated remote PTY;
- keep archive acquisition, build, live session/process-tree cleanup, and remote transport `NOT_EXERCISED` in this deterministic adapter PR;
- retain merge, remote PTY exposure, permission widening, failed-session retention, and production promotion as Human-owned operations.
