/**
 * The seed model: the inside of one context from `samples/insurance.ddd`.
 *
 * `Risk appetite` is chosen because the map already says what its aggregates
 * are — `Submission`, `AppetiteRuleSet`, `Referral` — so the two documents can
 * be checked against each other from the first day, and the check has something
 * to find rather than being a feature with no data.
 *
 * It is also the context whose `language` entry makes the point about words:
 * a Risk here is *a described exposure under consideration*, which is not what
 * a Risk is two contexts away. A domain model is where that stops being a note
 * and becomes a type.
 */
export const SAMPLE = `// The inside of one bounded context from the map next door.
//
// The aggregates here are the ones "Risk appetite" declares in
// samples/insurance.ddd. Keeping the names identical is the point: the name is
// the identity in both formats, and it is what lets one document be checked
// against the other.

model "Risk appetite" {

  // Shared across the aggregates below, so declared at the top rather than
  // inside one of them.
  value "Money" {
    attribute "amount"   : "Decimal"
    attribute "currency" : "CurrencyCode"
  }

  enum "SubmissionState" {
    "Draft" "Submitted" "Referred" "Declined" "Withdrawn"
  }

  aggregate "Submission" {
    intent "A request to write a risk, judged against what the carrier is
            currently willing to take on."

    invariant "A submission that has been withdrawn cannot be referred or
               declined."
    invariant "Every risk item on a submission names a cover the product
               catalogue still offers."

    root entity "Submission" {
      id        "SubmissionId"
      attribute "receivedAt" : "Instant"
      attribute "broker"     : "PartyId"
      embeds    "SubmissionState" one
      contains  "RiskItem" at-least-one
      references "AppetiteRuleSet" one
    }

    entity "RiskItem" {
      id        "RiskItemId"
      attribute "cover"  : "CoverCode"
      embeds    "Money" one
    }
  }

  aggregate "AppetiteRuleSet" {
    intent "What the carrier will and will not take on, as of a date."

    invariant "Exactly one version of a rule set is effective on any given
               date."

    root entity "AppetiteRuleSet" {
      id        "AppetiteRuleSetId"
      attribute "effectiveFrom" : "Date"
      contains  "AppetiteRule" many
    }

    entity "AppetiteRule" {
      id        "AppetiteRuleId"
      attribute "cover"    : "CoverCode"
      attribute "decision" : "Decision"
      embeds    "Money" optional
    }
  }

  aggregate "Referral" {
    intent "A submission an underwriter has to look at, and why."

    invariant "A referral is closed by exactly one underwriter decision."

    root entity "Referral" {
      id        "ReferralId"
      attribute "raisedAt" : "Instant"
      attribute "reason"   : "ReferralReason"
      references "Submission" one
    }
  }
}
`;
