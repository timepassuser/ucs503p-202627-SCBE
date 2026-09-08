# UCS503P Project Template

This is a project template for UCS503P Project (2026-27
ODD). 

There are 3 reports in LaTeX format, namely *a*)
Project Proposal, *b*) Project Report Prototype Stage,
and *c*) Project Report Final -- each in their
respective folders.

Journals are stacked under the folder `journals`, one
folder for each team member.  A sample entry has been
made for example.

The source code is contained within the folder `code`.

The documentation is under folder `docs`.

All other aspects of code organisation are left to the
discretion of the user(s).

## Quick reset

If you want to clear all local app data and reseed two
test accounts from scratch, run:

```shell
node code/quick_sample.js
```

This recreates the SQLite database and seeds:
- `test_student_one` / `Test Student One`
- `test_faculty_one` / `Test Faculty One`

Both use their ID as the password.


## Docs

As of now, the `docs` is just an organised collection
of markdown (`md`) files.  But the build procedure is
using [`mkdocs`](https://google.com/search?q=mkdocs)
backend.  As a result, any commit into the `master`
branch of github repository would result in CI/CD based
build and deployment of the documentation including the
journals.

For a local DEV-version of the docs for viewing and
testing, install the local env and issue the following
command:

``` shell
make docs
```

### Local `env` for `docs`

``` shell

```
