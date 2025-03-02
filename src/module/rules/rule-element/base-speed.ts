import { CreaturePF2e } from "@actor";
import { MovementType } from "@actor/creature/data";
import { ActorType } from "@actor/data";
import { ItemPF2e } from "@item";
import { tupleHasValue } from "@util";
import { RuleElementOptions, RuleElementPF2e, RuleElementSource } from ".";
import { DeferredMovementType } from "../synthetics";

/**
 * @category RuleElement
 */
class BaseSpeedRuleElement extends RuleElementPF2e {
    protected static override validActorTypes: ActorType[] = ["character", "familiar", "npc"];

    static VALID_SELECTORS = ["burrow", "fly", "climb", "swim"] as const;

    selector: BaseSpeedSelector = "fly";

    constructor(data: RuleElementSource, item: Embedded<ItemPF2e>, options?: RuleElementOptions) {
        super(data, item, options);

        const speedType = String(data.selector)
            .trim()
            .replace(/-speed$/, "");

        if (speedType === "land") {
            this.failValidation("A land speed may not be created");
        } else if (!tupleHasValue(BaseSpeedRuleElement.VALID_SELECTORS, speedType)) {
            this.failValidation("Unrecognized or missing selector");
        } else {
            this.selector = speedType;
        }
    }

    override beforePrepareData(): void {
        if (this.ignored) return;
        const speed = this.#createMovementType();
        const synthetics = (this.actor.synthetics.movementTypes[this.selector] ??= []);
        synthetics.push(speed);
    }

    #createMovementType(): DeferredMovementType {
        return () => {
            if (!this.test()) null;

            const value = this.resolveValue(this.data.value);
            if (!(typeof value === "number" && Number.isInteger(value) && value > 0)) {
                this.failValidation("Base speed requires a positive value field");
                return null;
            }

            return {
                type: this.selector,
                value,
            };
        };
    }
}

interface BaseSpeedRuleElement extends RuleElementPF2e {
    get actor(): CreaturePF2e;
}

type BaseSpeedSelector = Exclude<MovementType, "land">;

export { BaseSpeedRuleElement };
