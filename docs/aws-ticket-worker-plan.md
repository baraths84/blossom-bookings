# Build a ticket-driven coding workflow on AWS

Start with one ticket in your application that a reviewer can verify in a few minutes. The first milestone is opening the worker’s **tested Git commit** in a fresh checkout, rerunning the checks, and trying the feature. Once that works, the same job can run after you close your laptop, and several tickets can run independently.

## How Blossom fits together

Blossom Bookings is the application being changed. React Router selects the screens, `BookingContext.jsx` holds shared booking and search state, `src/lib/booking.js` handles date and price rules, and `src/lib/storage.js` persists demo data in the browser. On the workshop’s `starter/301-delivery` branch, the app lives in `foundation/`. The `main` checkout puts its application package at the repository root. The AWS diagram describes the development workflow around that code. Your own web or mobile application can keep its current hosting and release process. [Exercise map](exercise-starters.md)

| Part of the workshop | What it owns |
| --- | --- |
| Desktop and Ubuntu devbox | The developer uses Codex and Chrome. SSH connects the desktop to the devbox. The devbox has a Git clone, invokes the broker and later imports results. The desktop can disconnect during a run. |
| Lambda job broker | The client sends a ticket ID, receives an attempt and a MicroVM ID, and can subsequently query or stop the run. The broker starts a separate worker for each ticket. |
| Workboard and Design | Workboard supplies the ticket, its acceptance criteria and versioned status. Design supplies the referenced revision, requirements and mockup. The worker reads these through MCP, a protocol that gives the coding agent tools for accessing those services. |
| AWS Lambda MicroVM and Amazon Bedrock | A versioned image supplies an isolated Linux environment with a clean Git starter, Codex CLI, project dependencies and Chromium. Codex calls the model through Bedrock. File edits, Git commands, builds and tests run inside the MicroVM. |
| Private S3 and review worktree | The worker uploads the Git change and evidence. The devbox verifies the archive and opens the exact tested commit in a Git worktree, a separate checkout. A human records a decision against that SHA. |

**Follow the sorting ticket.** `BB-3012` asks for sorting on the Explore screen. The worker reads the ticket and the linked design, claims the ticket, and starts from the same released commit as the CSV and trip-link workers. It implements sorting, adds a browser test and creates a commit. A separate program reruns unit tests, lint, build and Playwright against the committed tree. It checks the Git revision and clean working tree before and after testing.

The worker publishes an archive under `outputs/<namespace>/<ticket>/attempt-<N>.tar.gz`. A complete result includes `feature.bundle`, `RUN.json`, `checks.json`, `HANDOFF.md`, and any collected evidence. After a successful upload and passing checks, the worker submits that SHA to Workboard for review. The reviewer imports the bundle, selects the Homes filter, chooses ascending price, and verifies that the same homes appear in the right order. Acceptance changes the ticket state. Git integration and application deployment are subsequent decisions.

The hosted Workboard and Design services have their own architecture. API Gateway routes HTTPS through a VPC Link and an internal load balancer to two ECS Fargate services. Each has its own IAM role and DynamoDB table. Ticket and design definitions ship as versioned fixtures. The tables hold access records and, for Workboard, ticket status. You can replace both services with an existing tracker and versioned design documents.

## Where to find the implementation

There are two neighboring folders on this machine. The Git repository is `Desktop/blossom-bookings`. The companion resources are in `Desktop/Blossom Bookings/resources/cloud-development`. The following paths are relative to the companion resources.

| Read this file | Look for |
| --- | --- |
| `infrastructure/microvm/README.md` | What one worker verifies, how the image is built, and which organizer components the guide references. |
| `scenarios/stay-sorting/ticket.json` and `design.json` in the same folder | An actual assignment with measurable acceptance criteria, a referenced design revision and an image digest. |
| `infrastructure/microvm/Dockerfile` and `config.toml` | Pinned runtime and tools, starting Git bundle, preinstalled Chromium, connectors, sandbox and model provider. |
| `infrastructure/microvm/worker.mjs` and `worker-result.mjs` | MicroVM lifecycle hooks, validated assignment, headless `codex exec`, independent checks, archive publication and ticket submission. |
| `tools/job.py` | Lambda invocation, attempt identity, S3 checksum validation, Git bundle verification, ancestry checks and detached worktree creation. |
| `tools/review-ticket.mjs` | A separate reviewer identity and a decision bound to the tested SHA and ticket version. |
| `infrastructure/microvm/resources.yaml` and `docs/integrations/deployment.md` | Example S3, logging and IAM resources, plus the architecture and operating costs of the optional hosted ticket and design services. |

The participant kit points to an organizer repository for `infrastructure/microvm/image-build.yaml`, `build-image.py`, and `infrastructure/managed-jobs/`, which provisions the broker and related roles. Those files are absent from the participant kit inspected here. The `resources.yaml` file supplies part of the infrastructure. Plan to implement your broker and image deployment from the public AWS interfaces or obtain the organizer components separately. The workshop job client also assumes Linux, a workshop seat, fixed ticket fixtures and the `starter/301-delivery` ref. Those are the first places to adapt.

## A first version for your AWS account

Assume one private Git repository, an existing development machine, and an application that can run its CI checks on Linux with test data. If your app needs PostgreSQL, Redis or an external API, choose a disposable test database, isolated schema or test double for each attempt. Record its setup in the verification command.

| Component | First implementation |
| --- | --- |
| Dispatch and review | A small CLI on your laptop or existing Linux devbox. Use AWS IAM Identity Center for a person and an instance role for an EC2 devbox. Put the review decision behind the reviewer’s own identity. |
| Assignment source | One versioned ticket and design brief in your repository, or a snapshot from your existing tracker. Capture the revision or content digest and the full base Git SHA at dispatch. |
| Broker and job state | One ordinary Lambda function and one DynamoDB table. Use a conditional write to reserve an attempt and keep one active attempt per project and ticket. The table is a proposed design for your broker. |
| Execution | One AWS Lambda MicroVM per attempt, launched from a pinned image version. Qualify the toolchain, browser architecture and chosen Bedrock model in the region you will use. |
| Evidence and operations | A private, encrypted S3 bucket with separate input and result prefixes, CloudWatch logs, a maximum worker lifetime and an explicit retention period. |
| Integration | A reviewer imports the candidate or opens a PR from its verified commit. Existing protected-branch CI runs on the integration result. Your normal release pipeline deploys accepted changes. |

AWS Lambda **functions** and **MicroVMs** have different jobs here. The function reserves and launches an attempt, then returns. The MicroVM is the Linux environment where the agent and browser run. AWS documents an eight-hour maximum MicroVM lifetime, including suspended time. Set a smaller deadline appropriate to your CI and model usage. For a background coding job, also configure the traffic-based idle policy so a quiet endpoint can keep working through the expected job duration. [MicroVM lifecycle](https://docs.aws.amazon.com/lambda/latest/dg/microvms-launching.html) · [Service quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html#microvms-quotas)

## Implementation sequence

### 1. Define the assignment and prove the baseline locally

Pick one bounded ticket with an observable behavior, a small change surface and a clean starting commit. Write the acceptance criteria as specific actions and expected outcomes. Capture the app’s install, build, unit-test and end-to-end commands in a script that exits nonzero on failure. Run that script from a clean checkout of the base SHA and keep the output. Known pre-existing failures need an explicit baseline and an agreed pass criterion.

For the Blossom delivery branch, dependencies, unit tests, lint, build and Playwright run from `foundation/`. Your app supplies its own working directory, runtime, commands, test services and a behavior to try. **Done when** another developer can reproduce the baseline without hidden files, production data or your interactive shell.

### 2. Build a local one-ticket runner

Give the runner a manifest. The values below illustrate the contract. Replace the placeholders with real full Git and content hashes and an actual image version before dispatch.

```json
{
  "project": "customer-portal",
  "ticketId": "APP-42",
  "attempt": 1,
  "ticketRevision": "7",
  "designRef": "docs/design/order-history.md",
  "designDigest": "<sha256-of-design>",
  "baseCommit": "<full-git-sha>",
  "candidateRef": "refs/heads/codex/app-42-attempt-1",
  "workerImageVersion": "<published-image-version>",
  "checksProfile": "web-ci-v1",
  "resultKey": "results/customer-portal/APP-42/attempt-1.tar.gz"
}
```

The runner loads the pinned input, verifies `HEAD`, creates the candidate branch and invokes Codex non-interactively. Give Codex the approved workspace, ticket, design and repository instructions. After it commits, capture the candidate SHA and use a verifier installed outside the editable repository to run your required checks. Record commands, exit codes and the tested SHA. Verify the worktree stays clean. Include the exact branch in a Git bundle, collect the approved evidence files, and produce a small handoff with a manual acceptance step. Protect your standard CI checks through their normal review controls, and review any candidate changes to tests or build scripts. [Headless Codex](https://learn.chatgpt.com/docs/non-interactive-mode)

**Done when** a second clean clone can verify the bundle, open the candidate SHA and reproduce its behavior. Also intentionally exercise a failing check. The failure should produce useful evidence and leave the ticket open.

### 3. Prove one real worker in your AWS sandbox

1. Select an account and region with Lambda MicroVMs and a supported Bedrock model or inference profile. Check quotas, worker architecture and the permissions needed by your pinned Codex CLI. The kit uses Oregon, an ARM64 worker, `amazon-bedrock-runtime`, and `us.openai.gpt-6-astra`. Those are workshop choices. For Bedrock Runtime, the Codex guide specifies `web_search = "disabled"`. Run a small Codex turn that reads a fixture and successfully calls a local tool under the actual worker role. [Codex on Bedrock](https://learn.chatgpt.com/docs/amazon-bedrock)
2. Provision private S3 storage, logs, an image-build role and a runtime role with infrastructure as code. The build identity reads the packaged build input. The runtime identity can invoke the chosen Bedrock profile, write its logs and access assigned input/output objects. Use grants scoped to the run, or exact-key, time-limited S3 transfers. Keep secrets and reviewer credentials out of snapshots and evidence.
3. Package a Dockerfile and runner in a ZIP, upload it to a content-addressed S3 key, and build a Lambda MicroVM image. AWS supports the `AWS::Lambda::MicrovmImage` CloudFormation resource. Pin the resulting version. For the pilot, baking your clean Git bundle into the image mirrors Blossom. For frequent commits, keep tools in a reusable image and load a verified, content-addressed Git bundle for the requested base at runtime. The review clone must already have, or be able to fetch, that base. [Image build guide](https://docs.aws.amazon.com/lambda/latest/dg/microvms-images.html) · [CloudFormation resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-lambda-microvmimage.html)
4. Implement the platform’s ready and run hooks. The run hook validates a compact assignment reference, starts the worker in the background and acknowledges launch. A coding worker can use outbound access for Bedrock, artifact transfer and scoped connectors. It needs no public inbound app endpoint. Launch one VM, cap its duration, publish evidence and terminate it. [AWS walkthrough](https://docs.aws.amazon.com/lambda/latest/dg/microvms-getting-started.html) · [Launch API](https://docs.aws.amazon.com/boto3/latest/reference/services/lambda-microvms/client/run_microvm.html)

**Done when** your worktree importer can recover a real cloud result after the VM has terminated. Confirm the stored output contains the commit, evidence and accounting identifiers you need, and that a failing cloud run is distinguishable from a successful one.

### 4. Make dispatch and recovery reliable

Implement `dispatch`, `status`, `review`, `stop` and `retry` in your CLI. Give the broker a restricted role to launch, inspect and terminate the intended workers and to pass only the approved execution role. Persist `project`, `ticket`, `attempt`, input revisions, base SHA, image version, launch token, VM ID, deadline, result location and timestamps. Keep worker lifecycle, evidence availability and human review status as distinct fields. A terminated VM can have a reviewable success, a partial result or no result.

For `dispatch`, reserve the attempt before calling AWS. Persist the exact launch payload and use a stable `RunMicrovm.clientToken` for all deliveries of that attempt. Save the returned MicroVM ID. If the broker loses its response, recover the reserved attempt using the same token and parameters. An intentional retry creates a new attempt, token, result key and review directory. A periodic reconciliation job can recover interrupted launches, expire stuck jobs and stop workers when publication is confirmed. [Idempotent launch parameter](https://docs.aws.amazon.com/boto3/latest/reference/services/lambda-microvms/client/run_microvm.html)

| Event | Expected behavior |
| --- | --- |
| Developer dispatches twice or disconnects | Both dispatch requests resolve to the same active attempt. A later `status` can retrieve its ID and result. |
| Tests fail | Save available logs, the failed stage, check exit codes and any scoped handoff. Keep it out of the passing review queue. |
| S3 upload succeeds but tracker update fails | Reconcile the tracker from the verified artifact and tested SHA. Keep the original attempt and avoid another model run. |
| Worker dies before upload | Mark the attempt interrupted after confirming the terminal state or deadline. Link any available logs and allow an explicit retry. |
| A previous result arrives late | Associate it only with the original attempt. Conditional tracker updates prevent it from replacing the current candidate. |

**Done when** a duplicate dispatch, a lost broker response, a failed check and a tracker outage each have a tested recovery path.

### 5. Add human review and your existing integrations

Write the result archive once per attempt, for example with an S3 conditional put using `If-None-Match: *`. Record a SHA-256 checksum. Import validates the expected bucket and object, checksum, assignment and attempt, bundle ref, exact candidate SHA, base ancestry and required checks. Validate archive members before extracting them. Open a detached review worktree only after these checks succeed. S3 integrity verification confirms the bytes received. Reviewing the diff and rerunning CI establish what the code does.

Connect your issue tracker when the single-ticket pilot works. A worker grant can read the assigned ticket, claim it and propose a tested SHA. A design grant can read the linked revision. A separate human reviewer grant can accept or request changes for the current SHA and ticket version. If you use GitHub, put branch or PR publishing under a separate integration identity or the developer’s own account. If you use Figma, store a versioned export or receipt for the exact design the worker used.

**Done when** a reviewer can reproduce the result without the original VM, request changes with a note, and receive a second attempt with a separate evidence trail. A changed or rebased commit gets fresh CI evidence. Integrate accepted parallel changes on the target branch and test them together before release.

### 6. Increase concurrency and set an operating budget

Start with one worker, then dispatch two or three independent tickets from the same base. Give each its own Git directory, test data, result key and review folder. Serialize tickets that depend on each other, or launch the dependent ticket against a newly tested base. Measure worker elapsed time, model input/output tokens, browser test duration, failure stages and cost per **accepted** ticket, including retries.

Set limits for active workers, attempts per ticket, maximum VM duration and model usage. Add alerts for failed or overdue jobs and a lifecycle rule for evidence retained beyond the review window. Include VM compute, snapshot storage and I/O, Bedrock inference, S3, logs and any standing EC2, NAT, load balancer or endpoint charges. A laptop and your existing tracker can eliminate much of the standing infrastructure for a pilot. [Lambda pricing](https://aws.amazon.com/lambda/pricing/) · [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/)

**Pilot acceptance exercise.** Submit two tickets from the same base, duplicate one dispatch, disconnect, return after the workers stop, and import both results. Accept one result and request changes on the other. Verify that the retry preserves its first attempt and that CI passes on the combined code before merging. This exercise tests the workflow your team will actually rely on.

If Lambda MicroVMs are unavailable in your chosen account or region, the same assignment and evidence contract works with one CodeBuild build per attempt. Swap the MicroVM lifecycle hooks and launch/status/stop adapter for a one-shot build entry point. The Git verification, reviewer identity and integration tests remain applicable. [CodeBuild project settings](https://docs.aws.amazon.com/codebuild/latest/userguide/create-project.html)
