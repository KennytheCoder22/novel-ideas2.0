# Source Certification Standard (SCS)

## Version
- **Current Version:** 2.0
- **Effective Date:** 2026-07-27
- **Scope:** Governance/process standard for source and slice certification execution.
- **Constitution Relationship:** Implements constitutional governance intent; **not** a constitutional amendment.

## Backward Compatibility
1. Certifications accepted under prior SCS versions remain valid and do not require retroactive re-approval.
2. SCS v2.0 is mandatory for new certification work and for any slice explicitly reopened for recertification.
3. Existing frozen certified baselines remain frozen unless a formal recertification is initiated.

## Mandatory Certification Artifacts (Per Slice)
Every certification slice package must include all of the following:
1. **Deterministic certification regression script** for the slice (may invoke prerequisite suites).
2. **Required-path coverage table** with expected vs observed path evidence.
3. **Declared-but-unreached path table** with explicit reason, status, and note.
4. **Safety lifecycle documentation** where applicable (end-to-end detection -> gate decisions -> final outcome).
5. **Dual-registry closeout evidence**:
   - Certified Subsystem Registry update
   - Engineering Constitution Certification Registry update

## Required Workflow Ordering
Certification execution must follow this lifecycle order:

1. **Plan Approved**  
2. **Bounded Implementation**  
3. **Certification Regression Suite**  
4. **Evidence Package**  
5. **Human Review**  
6. **Freeze**  
7. **Registry Update**  
8. **Retrospective**

No slice may proceed to the next slice before Human Review acceptance of the current slice.

## Review Efficiency Rule
Previously accepted architectural findings must be **referenced, not restated**, unless new measured evidence changes those findings.

## Required Slice Package Section
Each slice package must begin with a **Certification Contract Header** containing:
- Certification Slice
- Scope
- Dependencies
- Explicitly Out of Scope
- Exit Criteria

## Freeze and Registry Closeout Rules
1. Freeze must be explicit and recorded (accepted decision + frozen baseline scripts).
2. Slice-level closeout updates the Certified Subsystem Registry.
3. Contract-level completion updates the Engineering Constitution Certification Registry.
4. Full contract certification requires all required slices accepted and frozen.

## Changelog
### v2.0 (2026-07-27)
Governance/process improvements adopted:
1. Added mandatory per-slice deterministic certification script requirement.
2. Added mandatory required-path coverage and declared-but-unreached tables.
3. Added safety lifecycle documentation requirement where applicable.
4. Added dual-registry closeout requirement.
5. Enforced lifecycle execution ordering from plan approval through retrospective.
6. Added review efficiency rule to reference accepted architecture instead of restating it.
7. Added mandatory Certification Contract Header section for each slice package.

