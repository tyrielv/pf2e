import { RemoveCoinsPopup } from './popups/remove-coins-popup';
import { sellAllTreasure, sellTreasure } from '@item/treasure';
import { AddCoinsPopup } from './popups/add-coins-popup';
import { addKit } from '@item/kits';
import { compendiumBrowser } from '../../packs/compendium-browser';
import { MoveLootPopup } from './loot/move-loot-popup';
import { ActorPF2e, SKILL_DICTIONARY } from '../base';
import { TraitSelector5e } from '@system/trait-selector';
import { ItemPF2e } from '@item/base';
import { ConditionData, isPhysicalItem, ItemData, SpellData, SpellcastingEntryData } from '@item/data-definitions';
import { ConditionManager } from '../../conditions';
import { IdentifyItemPopup } from './popups/identify-popup';
import { PF2EPhysicalItem } from '@item/physical';
import { ActorDataPF2e, SkillAbbreviation, AbilityString, SaveString } from '@actor/data-definitions';
import { ScrollWandPopup } from './popups/scroll-wand-popup';
import { createConsumableFromSpell, SpellConsumableTypes } from '@item/spell-consumables';
import { Spell } from '@item/spell';
import { SpellcastingEntry } from '@item/spellcasting-entry';
import { ConditionPF2e, SpellPF2e } from '@item/others';
import { LocalizePF2e } from '@system/localize';
import { ConfigPF2e } from '@scripts/config';
import { CreaturePF2e } from '@actor/creature';

/**
 * Extend the basic ActorSheet class to do all the PF2e things!
 * This sheet is an Abstract layer which is not used.
 * @category Actor
 */
export abstract class ActorSheetPF2e<ActorType extends ActorPF2e> extends ActorSheet<ActorType, ItemData> {
    /** @override */
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            scrollY: [
                '.sheet-sidebar',
                '.spellcastingEntry-list',
                '.actions-list',
                '.skills-pane',
                '.feats-pane',
                '.inventory-pane',
                '.actions-pane',
                '.spellbook-pane',
                '.skillstab-pane',
                '.pfs-pane',
            ],
        });
    }

    /**
     * Return the type of the current Actor
     */
    get type(): string {
        return this.actor.data.type;
    }

    /** @override */
    getData(): any {
        const sheetData = super.getData();

        this.prepareTraits(sheetData.data.traits);
        this.prepareItems(sheetData.actor);

        return {
            ...sheetData,
            isTargetFlatFooted: this.actor.getFlag(game.system.id, 'rollOptions.all.target:flatFooted'),
            isProficiencyLocked: this.actor.getFlag(game.system.id, 'proficiencyLock'),
        };
    }

    protected abstract prepareItems(actorData: ActorDataPF2e): void;

    protected findActiveList() {
        return (this.element as JQuery).find('.tab.active .directory-list');
    }

    protected prepareTraits(traits: any): void {
        if (traits === undefined) return;

        const map = {
            languages: CONFIG.PF2E.languages,
            dr: CONFIG.PF2E.resistanceTypes,
            di: CONFIG.PF2E.immunityTypes,
            dv: CONFIG.PF2E.weaknessTypes,
            ci: CONFIG.PF2E.immunityTypes,
            traits: CONFIG.PF2E.monsterTraits,
        };

        for (const [t, choices] of Object.entries(map)) {
            const trait = traits[t] || { value: [], selected: [] };

            if (Array.isArray(trait)) {
                // todo this is so wrong...
                (trait as any).selected = {};
                for (const entry of trait) {
                    if (typeof entry === 'object') {
                        if ('exceptions' in entry && entry.exceptions !== '') {
                            (trait as any).selected[entry.type] = `${choices[entry.type]} (${entry.value}) [${
                                entry.exceptions
                            }]`;
                        } else {
                            let text = `${choices[entry.type]}`;
                            if (entry.value !== '') text = `${text} (${entry.value})`;
                            (trait as any).selected[entry.type] = text;
                        }
                    } else {
                        (trait as any).selected[entry] = choices[entry] || `${entry}`;
                    }
                }
            } else if (trait.value) {
                trait.selected = Object.fromEntries(trait.value.map((name: string) => [name, name]));
            }

            // Add custom entry
            if (trait.custom) trait.selected.custom = trait.custom;
        }
    }

    /**
     * Insert a spell into the spellbook object when rendering the character sheet
     * @param actorData    The Actor data being prepared
     * @param spellbook    The spellbook data being prepared
     * @param spell        The spell data being prepared
     */
    protected prepareSpell(actorData: ActorDataPF2e, spellbook: any, spell: any) {
        const heightenedLevel = spell.data.heightenedLevel?.value;
        const spellLvl = heightenedLevel ?? (Number(spell.data.level.value) < 11 ? Number(spell.data.level.value) : 10);
        let spellcastingEntry: any = null;

        if ((spell.data.location || {}).value) {
            spellcastingEntry = (this.actor.getOwnedItem(spell.data.location.value) || {}).data;
        }

        // if the spellcaster entry cannot be found (maybe it was deleted?)
        if (!spellcastingEntry) {
            console.debug(`PF2e System | Prepare Spell | Spellcasting entry not found for spell ${spell.name}`);
            return;
        }

        // This is needed only if we want to prepare the data model only for the levels that a spell is already prepared in setup spellbook levels for all of those to catch case where sheet only has spells of lower level prepared in higher level slot
        const isNotLevelBasedSpellcasting =
            spellcastingEntry.data?.tradition?.value === 'wand' ||
            spellcastingEntry.data?.tradition?.value === 'scroll' ||
            spellcastingEntry.data?.tradition?.value === 'ritual' ||
            spellcastingEntry.data?.tradition?.value === 'focus';

        const spellsSlotsWhereThisIsPrepared = Object.entries(
            (spellcastingEntry.data?.slots || {}) as Record<any, any>,
        )?.filter(
            (slotArr) => !!Object.values(slotArr[1].prepared as any[]).find((slotSpell) => slotSpell?.id === spell._id),
        );
        const highestSlotPrepared =
            spellsSlotsWhereThisIsPrepared
                ?.map((slot) => parseInt(slot[0].match(/slot(\d+)/)[1], 10))
                .reduce((acc, cur) => (cur > acc ? cur : acc), 0) ?? spellLvl;
        const normalHighestSpellLevel = Math.ceil(actorData.data.details.level.value / 2);
        const maxSpellLevelToShow = Math.min(10, Math.max(spellLvl, highestSlotPrepared, normalHighestSpellLevel));
        // Extend the Spellbook level
        for (let i = maxSpellLevelToShow; i >= 0; i--) {
            if (!isNotLevelBasedSpellcasting || i === spellLvl) {
                spellbook[i] = spellbook[i] || {
                    isCantrip: i === 0,
                    isFocus: i === 11,
                    label: CONFIG.PF2E.spellLevels[i],
                    spells: [],
                    prepared: [],
                    uses: spellcastingEntry ? parseInt(spellcastingEntry.data?.slots[`slot${i}`].value, 10) || 0 : 0,
                    slots: spellcastingEntry ? parseInt(spellcastingEntry.data?.slots[`slot${i}`].max, 10) || 0 : 0,
                    displayPrepared:
                        spellcastingEntry &&
                        spellcastingEntry.data.displayLevels &&
                        spellcastingEntry.data.displayLevels[i] !== undefined
                            ? spellcastingEntry.data.displayLevels[i]
                            : true,
                    unpreparedSpellsLabel:
                        spellcastingEntry &&
                        spellcastingEntry.data.tradition.value === 'arcane' &&
                        spellcastingEntry.data.prepared.value === 'prepared'
                            ? game.i18n.localize('PF2E.UnpreparedSpellsLabelArcanePrepared')
                            : game.i18n.localize('PF2E.UnpreparedSpellsLabel'),
                };
            }
        }

        // Add the spell to the spellbook at the appropriate level
        spell.data.school.str = CONFIG.PF2E.spellSchools[spell.data.school.value];
        // Add chat data
        try {
            const item = this.actor.getOwnedItem(spell._id);
            if (item) {
                spell.spellInfo = item.getSpellInfo();
            }
        } catch (err) {
            console.debug(`PF2e System | Character Sheet | Could not load chat data for spell ${spell.id}`, spell);
        }

        const isSpontaneous = spellcastingEntry.data.prepared.value === 'spontaneous';
        const signatureSpells = spellcastingEntry.data.signatureSpells?.value ?? [];
        const isCantrip = spell.data.level.value === 0;
        const isFocusSpell = spell.data.traditions.value.includes('focus');
        const isRitual = spell.data.traditions.value.includes('ritual');

        if (isSpontaneous && signatureSpells.includes(spell._id) && !isCantrip && !isFocusSpell && !isRitual) {
            spell.data.isSignatureSpell = true;

            for (let i = spell.data.level.value; i <= maxSpellLevelToShow; i++) {
                spellbook[i].spells.push(spell);
            }
        } else {
            spellbook[spellLvl].spells.push(spell);
        }
    }

    /**
     * Insert prepared spells into the spellbook object when rendering the character sheet
     * @param spellcastingEntry    The spellcasting entry data being prepared
     * @param spellbook            The spellbook data being prepared
     */
    protected preparedSpellSlots(spellcastingEntry: any, spellbook: any) {
        for (const [key, spl] of Object.entries(spellbook as Record<any, any>)) {
            if (spl.slots > 0) {
                for (let i = 0; i < spl.slots; i++) {
                    const entrySlot = ((spellcastingEntry.data.slots[`slot${key}`] || {}).prepared || {})[i] || null;

                    if (entrySlot && entrySlot.id) {
                        const item: any = this.actor.getOwnedItem(entrySlot.id);
                        if (item) {
                            const itemCopy: any = duplicate(item);
                            if (entrySlot.expended) {
                                itemCopy.expended = true;
                            } else {
                                itemCopy.expended = false;
                            }

                            spl.prepared[i] = itemCopy;
                            if (spl.prepared[i]) {
                                // enrich data with spell school formatted string
                                if (
                                    spl.prepared[i].data &&
                                    spl.prepared[i].data.school &&
                                    spl.prepared[i].data.school.str
                                ) {
                                    spl.prepared[i].data.school.str =
                                        CONFIG.PF2E.spellSchools[spl.prepared[i].data.school.value];
                                }

                                // Add chat data
                                try {
                                    spl.prepared[i].spellInfo = item.getSpellInfo();
                                } catch (err) {
                                    console.debug(
                                        `PF2e System | Character Sheet | Could not load prepared spell ${entrySlot.id}`,
                                        item,
                                    );
                                }

                                spl.prepared[i].prepared = true;
                            }
                            // prepared spell not found
                            else {
                                spl.prepared[i] = {
                                    name: 'Empty Slot (drag spell here)',
                                    id: null,
                                    prepared: false,
                                };
                            }
                        } else {
                            // Could not find an item for ID: ${entrySlot.id}. Marking the slot as empty so it can be overwritten.
                            spl.prepared[i] = {
                                name: 'Empty Slot (drag spell here)',
                                id: null,
                                prepared: false,
                            };
                        }
                    } else {
                        // if there is no prepared spell for this slot then make it empty.
                        spl.prepared[i] = {
                            name: 'Empty Slot (drag spell here)',
                            id: null,
                            prepared: false,
                        };
                    }
                }
            }
        }
    }

    /**
     * Prepare Spell SLot
     * Saves the prepared spell slot data to the actor
     * @param spellLevel The level of the spell slot
     * @param spellSlot The number of the spell slot
     * @param spell The item details for the spell
     */
    private async allocatePreparedSpellSlot(spellLevel: number, spellSlot: number, spell: SpellData, entryId: string) {
        if (spell.data.level.value > spellLevel) {
            console.warn(`Attempted to add level ${spell.data.level.value} spell to level ${spellLevel} spell slot.`);
            return;
        }
        if (CONFIG.debug.hooks === true)
            console.debug(
                `PF2e System | Updating location for spell ${spell.name} to match spellcasting entry ${entryId}`,
            );
        const key = `data.slots.slot${spellLevel}.prepared.${spellSlot}`;
        const updates = {
            _id: entryId,
            [key]: { id: spell._id },
        };
        this.actor.updateEmbeddedEntity('OwnedItem', updates);
    }

    /**
     * Remove Spell Slot
     * Removes the spell from the saved spell slot data for the actor
     * @param spellLevel The level of the spell slot
     * @param spellSlot The number of the spell slot
     */
    private async removePreparedSpellSlot(spellLevel: number, spellSlot: number, entryId: string) {
        if (CONFIG.debug.hooks === true)
            console.debug(
                `PF2e System | Updating spellcasting entry ${entryId} to remove spellslot ${spellSlot} for spell level ${spellLevel}`,
            );
        const key = `data.slots.slot${spellLevel}.prepared.${spellSlot}`;
        const updates = {
            _id: entryId,
            [key]: {
                name: 'Empty Slot (drag spell here)',
                id: null,
                prepared: false,
            },
        };
        this.actor.updateEmbeddedEntity('OwnedItem', updates);
    }

    /**
     * Sets the expended state of a  Spell Slot
     * Marks the slot as expended which is reflected in the UI
     * @param spellLevel The level of the spell slot
     * @param spellSlot The number of the spell slot
     */
    private async setExpendedPreparedSpellSlot(
        spellLevel: number,
        spellSlot: number,
        entryId: string,
        isExpended: boolean,
    ) {
        const key = `data.slots.slot${spellLevel}.prepared.${spellSlot}.expended`;
        const updates = {
            _id: entryId,
            [key]: isExpended,
        };
        this.actor.updateEmbeddedEntity('OwnedItem', updates);
    }

    /* -------------------------------------------- */
    /*  Event Listeners and Handlers
    /* -------------------------------------------- */

    /** @override */
    activateListeners(html: JQuery): void {
        super.activateListeners(html);

        // Pad field width
        html.find('[data-wpad]').each((_i, e) => {
            const text = e.tagName === 'INPUT' ? (e as HTMLInputElement).value : e.innerText;
            const w = (text.length * parseInt(e.getAttribute('data-wpad'), 10)) / 2;
            e.setAttribute('style', `flex: 0 0 ${w}px`);
        });

        // Item summaries
        html.find('.item .item-name h4').on('click', (event) => {
            this.onItemSummary(event);
        });

        // NPC Attack summaries
        html.find('.item .melee-name h4').on('click', (event) => {
            this.onItemSummary(event);
        });

        // strikes
        html.find('.strikes-list [data-action-index]').on('click', '.action-name', (event) => {
            $(event.currentTarget).parents('.expandable').toggleClass('expanded');
        });

        const createStrikeRollContext = (rollNames: string[]) => {
            const targets = Array.from(game.user.targets)
                .map((token) => token.actor)
                .filter((actor) => !!actor);
            const target =
                targets.length === 1 && targets[0] instanceof CreaturePF2e ? (targets[0] as CreaturePF2e) : undefined;
            const options = this.actor.getRollOptions(rollNames);
            {
                const conditions = this.actor.items.filter((item) => item instanceof ConditionPF2e) as ConditionPF2e[];
                options.push(...conditions.map((item) => `self:${item.data.data.hud.statusName}`));
            }
            if (target) {
                const conditions = target.items.filter((item) => item instanceof ConditionPF2e) as ConditionPF2e[];
                options.push(...conditions.map((item) => `target:${item.data.data.hud.statusName}`));
            }
            return {
                options,
                targets: new Set(targets),
                target,
            };
        };
        const createAttackRollContext = (event: JQuery.TriggeredEvent, rollNames: string[]) => {
            const ctx = createStrikeRollContext(rollNames);
            return {
                event,
                options: Array.from(new Set(ctx.options)), // de-duplication
                targets: ctx.targets,
                // un-comment this when partial chat card secret blocks have been implemented
                //dc: ctx.target ? { value: ctx.target.data.data.attributes.ac.value } as PF2CheckDC : undefined,
            };
        };
        const createDamageRollContext = (event: JQuery.TriggeredEvent) => {
            const ctx = createStrikeRollContext(['all', 'damage-roll']);
            return {
                event,
                options: Array.from(new Set(ctx.options)), // de-duplication
                targets: ctx.targets,
            };
        };

        // the click listener registered on all buttons breaks the event delegation here...
        // html.find('.strikes-list [data-action-index]').on('click', '.damage-strike', (event) => {
        html.find('.strikes-list .damage-strike').on('click', (event) => {
            if (!['character', 'npc'].includes(this.actor.data.type))
                throw Error('This sheet only works for characters and NPCs');
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            const actionIndex = $(event.currentTarget).parents('[data-action-index]').attr('data-action-index');
            const rollContext = createDamageRollContext(event);
            this.actor.data.data.actions[Number(actionIndex)].damage(rollContext);
        });

        // the click listener registered on all buttons breaks the event delegation here...
        // html.find('.strikes-list [data-action-index]').on('click', '.critical-strike', (event) => {
        html.find('.strikes-list .critical-strike').on('click', (event) => {
            if (!['character', 'npc'].includes(this.actor.data.type))
                throw Error('This sheet only works for characters and NPCs');
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            const actionIndex = $(event.currentTarget).parents('[data-action-index]').attr('data-action-index');
            const rollContext = createDamageRollContext(event);
            this.actor.data.data.actions[Number(actionIndex)].critical(rollContext);
        });

        html.find('.spell-attack').on('click', (event) => {
            if (!['character'].includes(this.actor.data.type)) {
                throw Error('This sheet only works for characters');
            }
            const index = $(event.currentTarget).closest('[data-container-id]').data('containerId');
            const entry = this.actor.data.items.find((item) => item._id === index) as SpellcastingEntryData;
            if (entry?.data?.attack?.roll) {
                const rollContext = createAttackRollContext(event, ['all', 'attack-roll', 'spell-attack-roll']);
                entry.data.attack.roll(rollContext);
            }
        });

        // for spellcasting checks
        html.find('.spellcasting.rollable').on('click', (event) => {
            event.preventDefault();
            const itemId = $(event.currentTarget).parents('.item-container').attr('data-container-id');
            const item = this.actor.getOwnedItem(itemId);
            if (item) {
                item.rollSpellcastingEntryCheck(event);
            }
        });

        // Everything below here is only needed if the sheet is editable
        if (!this.options.editable) return;

        /* -------------------------------------------- */
        /*  Attributes, Skills, Saves and Traits
        /* -------------------------------------------- */

        // Roll Save Checks
        html.find('.save-name').on('click', (event) => {
            event.preventDefault();
            const save = $(event.currentTarget).parents('[data-save]')[0].getAttribute('data-save') as SaveString;
            if (this.actor.data.data.saves[save]?.roll) {
                const options = this.actor.getRollOptions(['all', 'saving-throw', save]);
                this.actor.data.data.saves[save].roll({ event, options });
            } else {
                this.actor.rollSave(event, save);
            }
        });

        // Roll Attribute Checks
        html.find('.roll-init').on('click', (event) => {
            event.preventDefault();
            const checkType = this.actor.data.data.attributes.initiative.ability as SkillAbbreviation;
            const options = this.actor.getRollOptions(
                ['all', 'initiative'].concat(SKILL_DICTIONARY[checkType] ?? checkType),
            );
            this.actor.data.data.attributes.initiative.roll({ event, options });
        });

        html.find('.attribute-name').on('click', (event) => {
            event.preventDefault();
            const attribute = event.currentTarget.parentElement?.getAttribute('data-attribute') || '';
            const isSecret = event.currentTarget.getAttribute('data-secret');
            if (this.actor.data.data.attributes[attribute]?.roll) {
                const options = this.actor.getRollOptions(['all', attribute]);
                if (isSecret) {
                    options.push('secret');
                }
                this.actor.data.data.attributes[attribute].roll({ event, options });
            } else {
                this.actor.rollAttribute(event, attribute);
            }
        });

        // Roll Ability Checks
        html.find('.ability-name').on('click', (event) => {
            event.preventDefault();
            const ability = event.currentTarget.parentElement?.getAttribute('data-ability') as AbilityString;
            if (ability) {
                this.actor.rollAbility(event, ability);
            }
        });

        // Roll Skill Checks
        html.find('.skill-name.rollable, .skill-score.rollable').on('click', (event) => {
            const skill = event.currentTarget.parentElement?.getAttribute('data-skill') as
                | SkillAbbreviation
                | undefined;
            if (!skill) {
                return;
            }
            if (this.actor.data.data.skills[skill]?.roll) {
                const options = this.actor.getRollOptions(['all', 'skill-check', SKILL_DICTIONARY[skill] ?? skill]);
                this.actor.data.data.skills[skill].roll({ event, options });
            } else {
                this.actor.rollSkill(event, skill);
            }
        });

        // Roll Recovery Flat Check when Dying
        html.find('.recoveryCheck.rollable').on('click', (event) => {
            this.actor.rollRecovery(event);
        });

        // Toggle Levels of stats (like proficiencies conditions or hero points)
        html.find('.click-stat-level').on('click contextmenu', this.onClickStatLevel.bind(this));

        // Remove Spell Slot
        html.find('.item-unprepare').on('click', (event) => {
            const spellLvl = Number($(event.currentTarget).parents('.item').attr('data-spell-lvl') ?? 0);
            const slotId = Number($(event.currentTarget).parents('.item').attr('data-slot-id') ?? 0);
            const entryId = $(event.currentTarget).parents('.item').attr('data-entry-id') ?? '';
            this.removePreparedSpellSlot(spellLvl, slotId, entryId);
        });

        // Set Expended Status of Spell Slot
        html.find('.item-toggle-prepare').on('click', (event) => {
            const slotId = Number($(event.currentTarget).parents('.item').attr('data-slot-id') ?? 0);
            const spellLvl = Number($(event.currentTarget).parents('.item').attr('data-spell-lvl') ?? 0);
            const entryId = $(event.currentTarget).parents('.item').attr('data-entry-id') ?? '';
            const expendedState = ((): boolean => {
                const expendedString = $(event.currentTarget).parents('.item').attr('data-expended-state') ?? '';
                return expendedString !== 'true';
            })();
            this.setExpendedPreparedSpellSlot(spellLvl, slotId, entryId, expendedState);
        });

        // Toggle equip
        html.find('.item-toggle-equip').on('click', (event) => {
            const f = $(event.currentTarget);
            const itemId = f.parents('.item').attr('data-item-id') ?? '';
            const active = f.hasClass('active');
            this.actor.updateEmbeddedEntity('OwnedItem', { _id: itemId, 'data.equipped.value': !active });
        });

        // Toggle invest
        html.find('.item-toggle-invest').on('click', (event) => {
            const f = $(event.currentTarget);
            const itemId = f.parents('.item').attr('data-item-id') ?? '';
            const active = f.hasClass('active');
            this.actor.updateEmbeddedEntity('OwnedItem', { _id: itemId, 'data.invested.value': !active });
        });

        // Trait Selector
        html.find('.trait-selector').on('click', (event) => this.onTraitSelector(event));

        html.find('.add-coins-popup button').on('click', (event) => this.onAddCoinsPopup(event));

        html.find('.remove-coins-popup button').on('click', (event) => this.onRemoveCoinsPopup(event));

        html.find('.sell-all-treasure button').on('click', (event) => this.onSellAllTreasure(event));

        // Feat Browser
        html.find('.feat-browse').on('click', () => compendiumBrowser.openTab('feat'));

        // Action Browser
        html.find('.action-browse').on('click', () => compendiumBrowser.openTab('action'));

        // Spell Browser
        html.find('.spell-browse').on('click', () => compendiumBrowser.openTab('spell'));

        // Inventory Browser
        html.find('.inventory-browse').on('click', () => compendiumBrowser.openTab('equipment'));

        // Spell Create
        html.find('.spell-create').on('click', (event) => this.onItemCreate(event));

        // Add Spellcasting Entry
        html.find('.spellcasting-create').on('click', (event) => this.createSpellcastingEntry(event));

        // Remove Spellcasting Entry
        html.find('.spellcasting-remove').on('click', (event) => this.removeSpellcastingEntry(event));

        // toggle visibility of filter containers
        html.find('.hide-container-toggle').on('click', (event) => {
            $(event.target)
                .parent()
                .siblings()
                .toggle(100, () => {});
        });

        /* -------------------------------------------- */
        /*  Inventory
        /* -------------------------------------------- */

        // Create New Item
        html.find('.item-create').on('click', (event) => this.onItemCreate(event));

        html.find('.item-toggle-container').on('click', (event) => this.toggleContainer(event));

        // Sell treasure item
        html.find('.item-sell-treasure').on('click', (event) => {
            const itemId = $(event.currentTarget).parents('.item').attr('data-item-id');
            sellTreasure(this.actor, itemId);
        });

        // Update Inventory Item
        html.find('.item-edit').on('click', (event) => {
            const itemId = $(event.currentTarget).parents('.item').attr('data-item-id');
            const item = this.actor.items.get(itemId ?? '');
            if (item) {
                item.sheet.render(true);
            }
        });

        // Toggle identified
        html.find('.item-toggle-identified').on('click', (event) => {
            const f = $(event.currentTarget);
            const itemId = f.parents('.item').attr('data-item-id');
            const identified = f.hasClass('identified');
            if (identified) {
                const item = this.actor.getOwnedItem(itemId);
                if (!(item instanceof PF2EPhysicalItem)) {
                    throw Error(`PF2e | ${item.name} is not a physical item.`);
                }
                item.setIsIdentified(false);
            } else {
                new IdentifyItemPopup(this.actor, { itemId }).render(true);
            }
        });

        // Delete Inventory Item
        html.find('.item-delete').on(
            'click',
            async (event): Promise<void> => {
                const li = $(event.currentTarget).parents('.item');
                const itemId = li.attr('data-item-id') ?? '';
                const item = this.actor.getOwnedItem(itemId);

                if (item instanceof ConditionPF2e && item.getFlag(game.system.id, 'condition')) {
                    // Condition Item.

                    const condition = item.data as ConditionData;
                    const list: string[] = [];
                    const references = li.find('.condition-references');

                    const deleteCondition = async (): Promise<void> => {
                        this.actor.data.items
                            .filter(
                                (i) =>
                                    i.type === 'condition' &&
                                    i.flags.pf2e?.condition &&
                                    i.data.base === condition.data.base &&
                                    i.data.value.value === condition.data.value.value,
                            )
                            .forEach((i: ConditionData) => {
                                list.push(i._id);
                            });

                        if (this.token) {
                            await ConditionManager.removeConditionFromToken(list, this.token);
                        } else {
                            await this.actor.deleteEmbeddedEntity('OwnedItem', list);
                        }
                    };

                    if (event.ctrlKey) {
                        deleteCondition();
                        return;
                    }

                    const content = await renderTemplate('systems/pf2e/templates/actors/delete-condition-dialog.html', {
                        name: item.name,
                        ref: references.html(),
                    });
                    new Dialog({
                        title: 'Remove Condition',
                        content,
                        buttons: {
                            Yes: {
                                icon: '<i class="fa fa-check"></i>',
                                label: 'Yes',
                                callback: deleteCondition,
                            },
                            cancel: {
                                icon: '<i class="fas fa-times"></i>',
                                label: 'Cancel',
                            },
                        },
                        default: 'Yes',
                    }).render(true);
                } else if (item instanceof ItemPF2e) {
                    const deleteItem = async (): Promise<void> => {
                        await this.actor.deleteOwnedItem(itemId);
                        if (item.type === 'lore') {
                            // normalize skill name to lower-case and dash-separated words
                            const skill = item.name.toLowerCase().replace(/\s+/g, '-');
                            // remove derived skill data
                            await this.actor.update({ [`data.skills.-=${skill}`]: null });
                        } else {
                            // clean up any individually targeted modifiers to attack and damage
                            await this.actor.update({
                                [`data.customModifiers.-=${itemId}-attack`]: null,
                                [`data.customModifiers.-=${itemId}-damage`]: null,
                            });
                        }
                        li.slideUp(200, () => this.render(false));
                    };
                    if (event.ctrlKey) {
                        deleteItem();
                        return;
                    }

                    const content = await renderTemplate('systems/pf2e/templates/actors/delete-item-dialog.html', {
                        name: item.name,
                    });
                    new Dialog({
                        title: 'Delete Confirmation',
                        content,
                        buttons: {
                            Yes: {
                                icon: '<i class="fa fa-check"></i>',
                                label: 'Yes',
                                callback: deleteItem,
                            },
                            cancel: {
                                icon: '<i class="fas fa-times"></i>',
                                label: 'Cancel',
                            },
                        },
                        default: 'Yes',
                    }).render(true);
                } else {
                    return Promise.reject(new Error('PF2E System | Item not found'));
                }
            },
        );

        // Increase Item Quantity
        html.find('.item-increase-quantity').on('click', (event) => {
            const itemId = $(event.currentTarget).parents('.item').attr('data-item-id') ?? '';
            const item = this.actor.getOwnedItem(itemId);
            if (!(item instanceof PF2EPhysicalItem)) {
                throw new Error('PF2e System | Tried to update quantity on item that does not have quantity');
            }
            this.actor.updateEmbeddedEntity('OwnedItem', {
                _id: itemId,
                'data.quantity.value': Number(item.data.data.quantity.value) + 1,
            });
        });

        // Decrease Item Quantity
        html.find('.item-decrease-quantity').on('click', (event) => {
            const li = $(event.currentTarget).parents('.item');
            const itemId = li.attr('data-item-id') ?? '';
            const item = this.actor.getOwnedItem(itemId);
            if (!(item instanceof PF2EPhysicalItem)) {
                throw new Error('Tried to update quantity on item that does not have quantity');
            }
            if (Number(item.data.data.quantity.value) > 0) {
                this.actor.updateEmbeddedEntity('OwnedItem', {
                    _id: itemId,
                    'data.quantity.value': Number(item.data.data.quantity.value) - 1,
                });
            }
        });

        // Toggle Spell prepared value
        html.find('.item-prepare').on('click', (event) => {
            const itemId = $(event.currentTarget).parents('.item').attr('data-item-id');
            const item = this.actor.getOwnedItem(itemId ?? '');
            if (!(item instanceof SpellPF2e)) {
                throw new Error('Tried to update prepared on item that does not have prepared');
            }
            this.actor.updateEmbeddedEntity('OwnedItem', {
                _id: item.id,
                'data.prepared.value': !item.data.data.prepared.value,
            });
        });

        // Item Dragging
        const handler = (event: DragEvent) => this._onDragItemStart(event as ElementDragEvent);
        html.find('.item').each((_i, li) => {
            li.setAttribute('draggable', 'true');
            li.addEventListener('dragstart', handler, false);
        });

        // Skill Dragging
        const skillHandler = (event: DragEvent) => this.onDragSkillStart(event as ElementDragEvent);
        html.find('.skill').each((_i, li) => {
            li.setAttribute('draggable', 'true');
            li.addEventListener('dragstart', skillHandler, false);
        });

        // Toggle Dragging
        html.find('[data-toggle-property][data-toggle-label]').each((_i, li) => {
            li.setAttribute('draggable', 'true');
            li.addEventListener('dragstart', (event) => this.onDragToggleStart(event as ElementDragEvent), false);
        });

        // change background for dragged over items that are containers
        const containerItems = Array.from(html[0].querySelectorAll('[data-item-is-container="true"]'));
        containerItems.forEach((elem: HTMLElement) =>
            elem.addEventListener('dragenter', () => elem.classList.add('hover-container'), false),
        );
        containerItems.forEach((elem: HTMLElement) =>
            elem.addEventListener('dragleave', () => elem.classList.remove('hover-container'), false),
        );

        // Action Rolling (strikes)
        html.find('[data-action-index].item .item-image.action-strike').on('click', (event) => {
            if (!('actions' in this.actor.data.data)) throw Error('Strikes are not supported on this actor');

            const actionIndex = $(event.currentTarget).parents('.item').attr('data-action-index');
            const options = this.actor.getRollOptions(['all', 'attack-roll']);
            const speaker = { actor: this.actor, token: this.token };
            this.actor.data.data.actions[Number(actionIndex)].roll({ event, speaker, options });
            const rollContext = createAttackRollContext(event, ['all', 'attack-roll']);
            this.actor.data.data.actions[Number(actionIndex)].roll(rollContext);
        });

        html.find('[data-variant-index].variant-strike').on('click', (event) => {
            if (!('actions' in this.actor.data.data)) throw Error('Strikes are not supported on this actor');
            event.stopImmediatePropagation();
            const actionIndex = $(event.currentTarget).parents('.item').attr('data-action-index');
            const variantIndex = $(event.currentTarget).attr('data-variant-index');
            const action = this.actor.data.data.actions[Number(actionIndex)];

            if (action.selectedAmmoId) {
                const ammo = this.actor.getOwnedItem(action.selectedAmmoId);
                if (ammo instanceof PF2EPhysicalItem) {
                    if (ammo.quantity < 1) {
                        ui.notifications.error(game.i18n.localize('PF2E.ErrorMessage.NotEnoughAmmo'));
                        return;
                    }
                    ammo.consume();
                }
            }

            const rollContext = createAttackRollContext(event, ['all', 'attack-roll']);
            action.variants[Number(variantIndex)].roll(rollContext);
        });

        html.find('[name="ammo-used"]').on('change', (event) => {
            event.stopPropagation();

            const actionIndex = $(event.currentTarget).parents('.item').attr('data-action-index');
            const action = this.actor.data.data.actions[Number(actionIndex)];
            const weapon = this.actor.getOwnedItem(action.item);
            const ammo = this.actor.getOwnedItem($(event.currentTarget).val() as string);

            if (weapon) weapon.update({ data: { selectedAmmoId: ammo?.id ?? null } });
        });

        // Item Rolling
        html.find('[data-item-id].item .item-image').on('click', (event) => this.onItemRoll(event));

        // Update Item Bonus on an actor.item input
        html.find<HTMLInputElement>('.focus-pool-input').on('change', async (event) => {
            event.preventDefault();
            const itemId = $(event.currentTarget).parents('.item-container').attr('data-container-id') ?? '';
            const focusPool = Math.clamped(Number(event.target.value), 0, 3);
            const item = this.actor.getOwnedItem(itemId);
            let focusPoints = getProperty(item.data, 'data.focus.points') || 0;
            focusPoints = Math.clamped(focusPoints, 0, focusPool);
            await this.actor.updateEmbeddedEntity('OwnedItem', {
                _id: itemId,
                'data.focus.points': focusPoints,
                'data.focus.pool': focusPool,
            });
        });

        // Update Item Bonus on an actor.item input
        html.find<HTMLInputElement>('.item-value-input').on('change', async (event) => {
            event.preventDefault();

            let itemId = $(event.currentTarget).parents('.item').attr('data-item-id');
            if (!itemId) {
                itemId = $(event.currentTarget).parents('.item-container').attr('data-container-id');
            }

            await this.actor.updateEmbeddedEntity('OwnedItem', {
                _id: itemId ?? '',
                'data.item.value': Number(event.target.value),
            });
        });

        // Update Item Name
        html.find<HTMLInputElement>('.item-name-input').on('change', async (event) => {
            const itemId = event.target.attributes['data-item-id']?.value;
            await this.actor.updateEmbeddedEntity('OwnedItem', { _id: itemId ?? '', name: event.target.value });
        });

        // Update used slots for Spell Items
        html.find<HTMLInputElement>('.spell-slots-input').on('change', async (event) => {
            event.preventDefault();

            const itemId = $(event.currentTarget).parents('.item').attr('data-item-id') ?? '';
            const slotLvl = Number($(event.currentTarget).parents('.item').attr('data-level') ?? 0);

            const key = `data.slots.slot${slotLvl}.value`;
            const options = { _id: itemId };
            options[key] = Number(event.target.value);

            await this.actor.updateEmbeddedEntity('OwnedItem', options);
        });

        // Update max slots for Spell Items
        html.find<HTMLInputElement>('.spell-max-input').on('change', async (event) => {
            event.preventDefault();

            const itemId = $(event.currentTarget).parents('.item').attr('data-item-id');
            const slotLvl = Number($(event.currentTarget).parents('.item').attr('data-level') ?? 0);
            const key = `data.slots.slot${slotLvl}.max`;
            const options = { _id: itemId };
            options[key] = Number(event.target.value);

            await this.actor.updateEmbeddedEntity('OwnedItem', options);
        });

        // Modify select element
        html.find<HTMLSelectElement>('.ability-select').on('change', async (event) => {
            event.preventDefault();

            const itemId = $(event.currentTarget).parents('.item-container').attr('data-container-id') ?? '';
            await this.actor.updateEmbeddedEntity('OwnedItem', {
                _id: itemId,
                'data.ability.value': event.target.value,
            });
        });

        // Update max slots for Spell Items
        html.find('.prepared-toggle').on('click', async (event) => {
            event.preventDefault();

            const itemId = $(event.currentTarget).parents('.item-container').attr('data-container-id') ?? '';
            const itemToEdit = this.actor.getOwnedItem(itemId)?.data;
            if (itemToEdit?.type !== 'spellcastingEntry')
                throw new Error('Tried to toggle prepared spells on a non-spellcasting entry');
            const bool = !(itemToEdit.data.showUnpreparedSpells || {}).value;

            await this.actor.updateEmbeddedEntity('OwnedItem', {
                _id: itemId ?? '',
                'data.showUnpreparedSpells.value': bool,
            });
        });

        html.find('.level-prepared-toggle').on('click', async (event) => {
            event.preventDefault();

            const parentNode = $(event.currentTarget).parents('.spellbook-header');
            const itemId = parentNode.attr('data-item-id') ?? '';
            const lvl = parentNode.attr('data-level') ?? '';
            const itemToEdit = this.actor.getOwnedItem(itemId)?.data;
            if (itemToEdit?.type !== 'spellcastingEntry')
                throw new Error('Tried to toggle prepared spells on a non-spellcasting entry');
            const currentDisplayLevels = itemToEdit.data.displayLevels || {};
            currentDisplayLevels[lvl] = !currentDisplayLevels[lvl];
            await this.actor.updateEmbeddedEntity('OwnedItem', {
                _id: itemId,
                'data.displayLevels': currentDisplayLevels,
            });
            this.render();
        });

        // Select all text in an input field on focus
        html.find<HTMLInputElement>('input[type=text], input[type=number]').on('focus', (event) => {
            event.currentTarget.select();
        });
    }

    /* -------------------------------------------- */
    /*  Event Listeners and Handlers                */
    /* -------------------------------------------- */

    /**
     * Handle clicking of stat levels. The max level is by default 4.
     * The max level can be set in the hidden input field with a data-max attribute. Eg: data-max="3"
     */
    private onClickStatLevel(event: JQuery.TriggeredEvent) {
        event.preventDefault();
        const field = $(event.currentTarget).siblings('input[type="hidden"]');
        const max = field.data('max') ?? 4;
        const { statType, category } = field.data();
        if (this.actor.getFlag('pf2e', 'proficiencyLock') && category === 'proficiency') return;

        // Get the current level and the array of levels
        const level = parseFloat(`${field.val()}`);
        // Toggle next level - forward on click, backwards on right
        let newLevel = event.type === 'click' ? Math.clamped(level + 1, 0, max) : Math.clamped(level - 1, 0, max);

        // Update the field value and save the form
        if (statType === 'item') {
            let itemId = $(event.currentTarget).parents('.item').attr('data-item-id');
            if (itemId === undefined) {
                // Then item is spellcastingEntry, this could be refactored
                // but data-contained-id and proviciency/proficient need to be refactored everywhere to give
                // Lore Skills, Martial Skills and Spellcasting Entries the same structure.

                itemId = $(event.currentTarget).parents('.item-container').attr('data-container-id') ?? '';
                if (category === 'focus') {
                    const item = this.actor.getOwnedItem(itemId);
                    const focusPoolSize = getProperty(item?.data ?? {}, 'data.focus.pool') || 1;
                    newLevel = Math.clamped(newLevel, 0, focusPoolSize);
                    this.actor.updateEmbeddedEntity('OwnedItem', { _id: itemId, 'data.focus.points': newLevel });
                } else {
                    this.actor.updateEmbeddedEntity('OwnedItem', { _id: itemId, 'data.proficiency.value': newLevel });
                }
            } else {
                this.actor.updateEmbeddedEntity('OwnedItem', { _id: itemId, 'data.proficient.value': newLevel });
            }
            return;
        }
        field.val(newLevel);
        this._onSubmit(event.originalEvent!);
    }

    protected _onDragItemStart(event: ElementDragEvent): boolean {
        event.stopImmediatePropagation();

        const itemId = event.currentTarget.getAttribute('data-item-id');
        const containerId = event.currentTarget.getAttribute('data-container-id');
        const actionIndex = event.currentTarget.getAttribute('data-action-index');

        const id = itemId ?? containerId ?? '';
        const item = this.actor.getOwnedItem(id);
        if (item) {
            event.dataTransfer!.setData(
                'text/plain',
                JSON.stringify({
                    type: 'Item',
                    data: item.data,
                    actorId: this.actor._id,
                    tokenId: this.actor.token?.id,
                    id: itemId,
                }),
            );

            return true;
        } else if (actionIndex && event) {
            event.dataTransfer!.setData(
                'text/plain',
                JSON.stringify({
                    type: 'Action',
                    index: actionIndex,
                    actorId: this.actor._id,
                }),
            );

            return true;
        }
        return false;
    }

    private onDragSkillStart(event: ElementDragEvent): boolean {
        const skill = event.currentTarget.getAttribute('data-skill');

        if (skill) {
            const skillName = $(event.currentTarget).find('.skill-name').text();
            event.dataTransfer!.setData(
                'text/plain',
                JSON.stringify({
                    type: 'Skill',
                    skill,
                    skillName,
                    actorId: this.actor._id,
                }),
            );

            return true;
        }
        return false;
    }

    private onDragToggleStart(event: ElementDragEvent): boolean {
        const property = event.currentTarget.getAttribute('data-toggle-property');
        const label = event.currentTarget.getAttribute('data-toggle-label');
        if (property) {
            event.dataTransfer!.setData(
                'text/plain',
                JSON.stringify({
                    type: 'Toggle',
                    property,
                    label,
                    actorId: this.actor._id,
                }),
            );
            return true;
        }
        return false;
    }

    /**
     * Handle a drop event for an existing Owned Item to sort that item
     * @param event
     * @param itemData
     */
    protected async _onSortItem(
        event: ElementDragEvent,
        itemData: ItemData,
    ): Promise<(ItemData | null)[] | ItemData | null> {
        const dropSlotType = $(event.target).parents('.item').attr('data-item-type');
        const dropContainerType = $(event.target).parents('.item-container').attr('data-container-type');

        // if they are dragging onto another spell, it's just sorting the spells
        // or moving it from one spellcastingEntry to another
        if (itemData.type === 'spell') {
            if (dropSlotType === 'spellLevel') {
                const { itemId, level } = $(event.target).closest('.item').data();

                if (typeof itemId === 'string' && typeof level === 'number') {
                    if (this._moveSpell(itemData as SpellData, itemId, level)) {
                        return this.actor.updateOwnedItem(itemData);
                    }
                }
            } else if (dropSlotType === 'spell') {
                const sourceId = itemData._id;
                const dropId = $(event.target).parents('.item').attr('data-item-id') ?? '';
                const target = this.actor.getOwnedItem(dropId);
                if (target instanceof SpellPF2e && sourceId !== dropId) {
                    const source: any = this.actor.getOwnedItem(sourceId);
                    const sourceLevel = source.data.data.heightenedLevel?.value ?? source.data.data.level.value;
                    const sourceLocation = source.data.data.location.value;
                    const targetLevel = target.data.data.heightenedLevel?.value ?? target.data.data.level.value;
                    const targetLocation = target.data.data.location.value;

                    if (sourceLevel === targetLevel && sourceLocation === targetLocation) {
                        const siblings: any[] = (this.actor as any).items.entries.filter(
                            (i: ItemPF2e) =>
                                i.data.type === 'spell' &&
                                i.data.data.level.value === sourceLevel &&
                                i.data.data.location.value === sourceLocation,
                        );
                        const sortBefore = source.data.sort >= target.data.sort;
                        source.sortRelative({ target, siblings, sortBefore });
                    } else {
                        if (this._moveSpell(itemData, targetLocation, targetLevel)) {
                            return this.actor.updateOwnedItem(itemData);
                        }
                    }
                }
            } else if (dropSlotType === 'spellSlot') {
                if (CONFIG.debug.hooks === true)
                    console.debug('PF2e System | ***** spell dropped on a spellSlot *****');
                const dropID = Number($(event.target).parents('.item').attr('data-item-id'));
                const spellLvl = Number($(event.target).parents('.item').attr('data-spell-lvl'));
                const entryId = $(event.target).parents('.item').attr('data-entry-id') ?? '';

                if (Number.isInteger(dropID) && Number.isInteger(spellLvl) && entryId) {
                    this.allocatePreparedSpellSlot(spellLvl, dropID, itemData, entryId);
                }
                return itemData;
            } else if (dropContainerType === 'spellcastingEntry') {
                // if the drop container target is a spellcastingEntry then check if the item is a spell and if so update its location.
                // if the dragged item is a spell and is from the same actor
                if (CONFIG.debug.hooks === true)
                    console.debug('PF2e System | ***** spell from same actor dropped on a spellcasting entry *****');

                const dropID = $(event.target).parents('.item-container').attr('data-container-id');

                if (dropID) {
                    itemData.data.location = { value: dropID };
                    return this.actor.updateEmbeddedEntity('OwnedItem', itemData);
                }
            }
        } else if (itemData.type === 'spellcastingEntry') {
            // target and source are spellcastingEntries and need to be sorted
            if (dropContainerType === 'spellcastingEntry') {
                const sourceId = itemData._id;
                const dropId = $(event.target).parents('.item-container').attr('data-container-id') ?? '';
                const source = this.actor.getOwnedItem(sourceId);
                const target = this.actor.getOwnedItem(dropId);

                if (source && target && source.id !== target.id) {
                    const siblings = this.actor.itemTypes.spellcastingEntry;
                    const sortBefore = source.data.sort >= target.data.sort;
                    source.sortRelative({ target, siblings, sortBefore });
                    return target.data;
                }
            }
        }

        const container = $(event.target).parents('[data-item-is-container="true"]');
        const containerId = container[0]?.dataset?.itemId?.trim();
        if (containerId) {
            await ActorPF2e.stashOrUnstash(
                this.actor,
                async () => this.actor.getOwnedItem(itemData._id) as PF2EPhysicalItem,
                containerId,
            );
        }
        return super._onSortItem(event, itemData);
    }

    protected async _onDropItemCreate(itemData: ItemData): Promise<ItemData | null> {
        if (itemData.type === 'ancestry' || itemData.type === 'background' || itemData.type === 'class') {
            // ignore these. they should get handled in the derived class
            ui.notifications.error(game.i18n.localize('PF2E.ItemNotSupportedOnActor'));
            return null;
        }
        return super._onDropItemCreate(itemData);
    }

    async onDropItem(data: DropCanvasData) {
        return await this._onDropItem({ preventDefault(): void {} } as ElementDragEvent, data);
    }

    /**
     * Extend the base _onDrop method to handle dragging spells onto spell slots.
     */
    protected async _onDropItem(
        event: ElementDragEvent,
        data: DropCanvasData,
    ): Promise<(ItemData | null)[] | ItemData | null> {
        event.preventDefault();

        const item = await ItemPF2e.fromDropData(data);
        const itemData = duplicate(item.data);

        const actor = this.actor;
        const isSameActor = data.actorId === actor._id || (actor.isToken && data.tokenId === actor.token.id);
        if (isSameActor) return this._onSortItem(event, itemData);

        if (data.actorId && isPhysicalItem(itemData)) {
            this.moveItemBetweenActors(
                event,
                data.actorId,
                data.tokenId ?? '',
                actor._id,
                actor.token?.id ?? '',
                data.id,
            );
            return itemData;
        }

        // get the item type of the drop target
        const dropSlotType = $(event.target).closest('.item').attr('data-item-type');
        const dropContainerType = $(event.target).parents('.item-container').attr('data-container-type');

        // otherwise they are dragging a new spell onto their sheet.
        // we still need to put it in the correct spellcastingEntry
        if (itemData.type === 'spell') {
            if (dropSlotType === 'spellSlot' || dropContainerType === 'spellcastingEntry') {
                const dropID = $(event.target).parents('.item-container').attr('data-container-id');
                if (typeof dropID !== 'string') {
                    throw Error('PF2e System | Unexpected error while adding spell to spellcastingEntry');
                }
                itemData.data.location = { value: dropID };
                this.actor._setShowUnpreparedSpells(dropID, itemData.data.level?.value);
                return this.actor.createEmbeddedEntity('OwnedItem', itemData);
            } else if (dropSlotType === 'spellLevel') {
                const { itemId, level } = $(event.target).closest('.item').data();

                if (typeof itemId === 'string' && typeof level === 'number') {
                    this._moveSpell(itemData, itemId, level);
                    return this.actor.createEmbeddedEntity('OwnedItem', itemData);
                }
            } else if (dropSlotType === 'spell') {
                const { containerId } = $(event.target).closest('.item-container').data();
                const { spellLvl } = $(event.target).closest('.item').data();

                if (typeof containerId === 'string' && typeof spellLvl === 'number') {
                    this._moveSpell(itemData, containerId, spellLvl);
                    return this.actor.createEmbeddedEntity('OwnedItem', itemData);
                }
            } else if (dropContainerType === 'actorInventory' && itemData.data.level.value > 0) {
                const popup = new ScrollWandPopup(
                    this.actor,
                    {},
                    async (heightenedLevel, itemType, spellData) => {
                        const consumableType =
                            itemType == 'wand' ? SpellConsumableTypes.Wand : SpellConsumableTypes.Scroll;

                        const item = await createConsumableFromSpell(consumableType, spellData, heightenedLevel);
                        return this._onDropItemCreate(item);
                    },
                    itemData,
                );
                popup.render(true);
                return itemData;
            } else {
                return null;
            }
        } else if (itemData.type === 'spellcastingEntry') {
            // spellcastingEntry can only be created. drag & drop between actors not allowed
            return null;
        } else if (itemData.type === 'kit') {
            await addKit(itemData, async (newItems) => {
                const items = await actor.createEmbeddedEntity('OwnedItem', newItems);
                if (Array.isArray(items)) {
                    return items.flatMap((i) => (i === null ? [] : i._id));
                }
                return items === null ? [] : [items._id];
            });
            return itemData;
        } else if (itemData.type === 'condition' && itemData.flags.pf2e?.condition) {
            const condition = itemData as ConditionData;
            const value: number = (data as any).value;
            if (value && condition.data.value.isValued) {
                condition.data.value.value = value;
            }
            const token = actor.token
                ? actor.token
                : canvas.tokens.controlled.find((canvasToken) => canvasToken.actor.id === actor.id);

            if (token) {
                await ConditionManager.addConditionToToken(condition, token);
                return itemData;
            } else {
                const translations = LocalizePF2e.translations.PF2E;
                const message = actor.can(game.user, 'update')
                    ? translations.ErrorMessage.ActorMustHaveToken
                    : translations.ErrorMessage.NoUpdatePermission;
                ui.notifications.error(message);
                return null;
            }
        }

        if (isPhysicalItem(itemData)) {
            const container = $(event.target).parents('[data-item-is-container="true"]');
            let containerId = null;
            if (container[0] !== undefined) {
                containerId = container[0].dataset.itemId?.trim();
            }
            itemData.data.containerId.value = containerId || '';
        }
        return this._onDropItemCreate(itemData);
    }

    /**
     * Moves an item between two actors' inventories.
     * @param event         Event that fired this method.
     * @param sourceActorId ID of the actor who originally owns the item.
     * @param targetActorId ID of the actor where the item will be stored.
     * @param itemId           ID of the item to move between the two actors.
     */
    async moveItemBetweenActors(
        event: ElementDragEvent,
        sourceActorId: string,
        sourceTokenId: string,
        targetActorId: string,
        targetTokenId: string,
        itemId: string,
    ): Promise<void> {
        const sourceActor = sourceTokenId ? game.actors.tokens[sourceTokenId] : game.actors.get(sourceActorId);
        const targetActor = targetTokenId ? game.actors.tokens[targetTokenId] : game.actors.get(targetActorId);
        const item = sourceActor?.getOwnedItem(itemId);

        if (sourceActor === null || targetActor === null) {
            return Promise.reject(new Error('PF2e System | Unexpected missing actor(s)'));
        }
        if (!(item instanceof PF2EPhysicalItem)) {
            return Promise.reject(new Error('PF2e System | Missing or invalid item'));
        }

        const container = $(event.target).parents('[data-item-is-container="true"]');
        const containerId = container[0] !== undefined ? container[0].dataset.itemId?.trim() : undefined;
        const sourceItemQuantity = Number(item.data.data.quantity.value);
        // If more than one item can be moved, show a popup to ask how many to move
        if (sourceItemQuantity > 1) {
            const popup = new MoveLootPopup(sourceActor, { maxQuantity: sourceItemQuantity }, (quantity) => {
                sourceActor.transferItemToActor(targetActor, item, quantity, containerId);
            });

            popup.render(true);
        } else {
            sourceActor.transferItemToActor(targetActor, item, 1, containerId);
        }
    }

    async _moveSpell(spellData: SpellData, targetLocation: string, targetLevel: number) {
        const spell = new Spell(spellData);

        if (spell.spellcastingEntryId === targetLocation && spell.heightenedLevel === targetLevel) {
            return false;
        }

        const spellcastingEntryData = this.actor.getOwnedItem(targetLocation)?.data;

        if (spellcastingEntryData?.type !== 'spellcastingEntry') {
            throw new Error(`PF2e System | SpellcastingEntry ${targetLocation} not found in actor ${this.actor._id}`);
        }

        const spellcastingEntry = new SpellcastingEntry(spellcastingEntryData);

        spellData.data.location = {
            value: targetLocation,
        };

        if (!spell.isCantrip && !spell.isFocusSpell && !spell.isRitual) {
            if (spellcastingEntry.isSpontaneous || spellcastingEntry.isInnate) {
                spellData.data.heightenedLevel = {
                    value: Math.max(spell.spellLevel, targetLevel),
                };
            }
        }

        return true;
    }

    /**
     * Handle rolling of an item from the Actor sheet, obtaining the Item instance and dispatching to it's roll method
     */
    private onItemRoll(event: JQuery.ClickEvent) {
        event.preventDefault();
        const itemId = $(event.currentTarget).parents('.item').attr('data-item-id');
        const item = this.actor.getOwnedItem(itemId ?? '');
        if (item instanceof PF2EPhysicalItem && !item.isIdentified) {
            // we don't want to show the item card for items that aren't identified
            return;
        }

        item?.roll(event);
    }

    /**
     * Handle rolling of an item from the Actor sheet, obtaining the Item instance and dispatching to it's roll method
     */
    private onItemSummary(event: JQuery.ClickEvent) {
        event.preventDefault();

        const li = $(event.currentTarget).parent().parent();
        const itemId = li.attr('data-item-id');
        const itemType = li.attr('data-item-type');

        if (itemType === 'spellSlot') return;

        const item = this.actor.getOwnedItem(itemId ?? '');
        if (!item) return;

        if (item.data.type === 'spellcastingEntry' || item.data.type === 'condition') return;

        const chatData = item.getChatData({ secrets: this.actor.owner });

        if (
            game.user.isGM ||
            !(item instanceof PF2EPhysicalItem) ||
            (item instanceof PF2EPhysicalItem && item.isIdentified)
        ) {
            this.renderItemSummary(li, item, chatData);
        }
    }

    protected renderItemSummary(li: JQuery, _item: ItemPF2e, chatData: any) {
        const localize = game.i18n.localize.bind(game.i18n);

        // Toggle summary
        if (li.hasClass('expanded')) {
            const summary = li.children('.item-summary');
            summary.slideUp(200, () => summary.remove());
        } else {
            const div = $(
                `<div class="item-summary"><div class="item-description">${chatData.description.value}</div></div>`,
            );
            const props = $('<div class="item-properties tags"></div>');
            if (chatData.properties) {
                chatData.properties
                    .filter((property: unknown) => typeof property === 'string')
                    .forEach((property: string) => {
                        props.append(`<span class="tag tag_secondary">${localize(property)}</span>`);
                    });
            }
            if (chatData.critSpecialization)
                props.append(
                    `<span class="tag" title="${localize(
                        chatData.critSpecialization.description,
                    )}" style="background: rgb(69,74,124); color: white;">${localize(
                        chatData.critSpecialization.label,
                    )}</span>`,
                );
            // append traits (only style the tags if they contain description data)
            if (chatData.traits && chatData.traits.length) {
                chatData.traits.forEach((property: any) => {
                    if (property.description)
                        props.append(
                            `<span class="tag tag_alt" title="${localize(property.description)}">${localize(
                                property.label,
                            )}</span>`,
                        );
                    else props.append(`<span class="tag">${localize(property.label)}</span>`);
                });
            }

            div.append(props);
            li.append(div.hide());
            div.slideDown(200);
        }
        li.toggleClass('expanded');
    }

    /**
     * Opens an item container
     */
    private toggleContainer(event: JQuery.ClickEvent) {
        const itemId = $(event.currentTarget).parents('.item').data('item-id');
        const item = this.actor.getOwnedItem(itemId);
        if (item === null || item.data.type !== 'backpack') {
            return;
        }

        const isCollapsed = item?.data?.data?.collapsed?.value ?? false;
        item.update({ 'data.collapsed.value': !isCollapsed });
    }

    /**
     * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
     */
    private onItemCreate(event: JQuery.ClickEvent) {
        event.preventDefault();
        const header = event.currentTarget;
        const data = duplicate(header.dataset);

        if (data.type === 'feat') {
            const featTypeString = game.i18n.localize(`PF2E.FeatType${data.featType.capitalize()}`);
            data.name = `${game.i18n.localize('PF2E.NewLabel')} ${featTypeString}`;
            mergeObject(data, { 'data.featType.value': data.featType });
        } else if (data.type === 'action') {
            const newLabel = game.i18n.localize('PF2E.NewLabel');
            const actionTypeLabel = game.i18n.localize(`PF2E.ActionType${data.actionType.capitalize()}`);
            data.name = `${newLabel} ${actionTypeLabel}`;
            mergeObject(data, { 'data.actionType.value': data.actionType });
        } else if (data.type === 'melee') {
            data.name = game.i18n.localize(`PF2E.NewPlaceholders.${data.type.capitalize()}`);
            mergeObject(data, { 'data.weaponType.value': data.actionType });
        } else if (data.type === 'spell') {
            // for prepared spellcasting entries, set showUnpreparedSpells to true to avoid the confusion of nothing appearing to happen.
            this.actor._setShowUnpreparedSpells(data.location, data.level);

            const newLabel = game.i18n.localize('PF2E.NewLabel');
            const spellLevel = game.i18n.localize(`PF2E.SpellLevel${data.level}`);
            const spellLabel = data.level > 0 ? game.i18n.localize('PF2E.SpellLabel') : '';
            data.name = `${newLabel} ${spellLevel} ${spellLabel}`;
            mergeObject(data, {
                'data.level.value': data.level,
                'data.location.value': data.location,
            });
            // Show the spellbook pages if you're adding a new spell
            const currentLvlToDisplay: Record<number, boolean> = {};
            currentLvlToDisplay[data.level] = true;
            this.actor.updateEmbeddedEntity('OwnedItem', {
                _id: data.location,
                'data.showUnpreparedSpells.value': true,
                'data.displayLevels': currentLvlToDisplay,
            });
        } else if (data.type === 'lore') {
            if (this.type === 'npc') {
                data.name = game.i18n.localize('PF2E.SkillLabel');
                data.img = '/icons/svg/d20-black.svg';
            } else data.name = game.i18n.localize('PF2E.NewPlaceholders.Lore');
        } else {
            data.name = game.i18n.localize(`PF2E.NewPlaceholders.${data.type.capitalize()}`);
        }

        this.actor.createEmbeddedEntity('OwnedItem', data);
    }

    /**
     * Handle creating a new spellcasting entry for the actor
     */
    private createSpellcastingEntry(event: JQuery.ClickEvent) {
        event.preventDefault();

        // let entries = this.actor.data.data.attributes.spellcasting.entry || {};

        let magicTradition = 'arcane';
        let spellcastingType = 'innate';

        // Render modal dialog
        const template = 'systems/pf2e/templates/actors/spellcasting-dialog.html';
        const title = game.i18n.localize('PF2E.SpellcastingTypeLabel');
        const dialogOptions = {
            width: 300,
            top: event.clientY - 80,
            left: window.innerWidth - 710,
        };
        const dialogData = {
            magicTradition,
            magicTraditions: CONFIG.PF2E.magicTraditions,
            spellcastingType,
            spellcastingTypes: CONFIG.PF2E.preparationType,
        };
        renderTemplate(template, dialogData).then((dlg) => {
            new Dialog(
                {
                    title,
                    content: dlg,
                    buttons: {
                        create: {
                            label: game.i18n.localize('PF2E.CreateLabelUniversal'),
                            callback: (html: JQuery) => {
                                // if ( onClose ) onClose(html, parts, data);
                                let name = '';
                                magicTradition = `${html.find('[name="magicTradition"]').val()}`;
                                if (magicTradition === 'ritual') {
                                    spellcastingType = '';
                                    name = `${CONFIG.PF2E.magicTraditions[magicTradition]}s`;
                                } else if (magicTradition === 'focus') {
                                    spellcastingType = '';
                                    name = `${CONFIG.PF2E.magicTraditions[magicTradition]} Spells`;
                                } else if (magicTradition === 'scroll') {
                                    spellcastingType = '';
                                    name = `${CONFIG.PF2E.magicTraditions[magicTradition]}`;
                                } else if (magicTradition === 'wand') {
                                    spellcastingType = 'prepared';
                                    name = `${CONFIG.PF2E.magicTraditions[magicTradition]}`;
                                } else {
                                    spellcastingType = `${html.find('[name="spellcastingType"]').val()}`;
                                    name = `${CONFIG.PF2E.preparationType[spellcastingType]} ${CONFIG.PF2E.magicTraditions[magicTradition]} Spells`;
                                }

                                // Define new spellcasting entry
                                const spellcastingEntity = {
                                    ability: {
                                        type: 'String',
                                        label: 'Spellcasting Ability',
                                        value: '',
                                    },
                                    spelldc: {
                                        type: 'String',
                                        label: 'Class DC',
                                        item: 0,
                                    },
                                    tradition: {
                                        type: 'String',
                                        label: 'Magic Tradition',
                                        value: magicTradition,
                                    },
                                    prepared: {
                                        type: 'String',
                                        label: 'Spellcasting Type',
                                        value: spellcastingType,
                                    },
                                    showUnpreparedSpells: { value: true },
                                };

                                const data = {
                                    name,
                                    type: 'spellcastingEntry',
                                    data: spellcastingEntity,
                                };

                                this.actor.createEmbeddedEntity('OwnedItem', (data as unknown) as ItemData);
                            },
                        },
                    },
                    default: 'create',
                },
                dialogOptions,
            ).render(true);
        });
    }

    /**
     * Handle removing an existing spellcasting entry for the actor
     */
    private removeSpellcastingEntry(event: JQuery.ClickEvent): void {
        event.preventDefault();

        const li = $(event.currentTarget).parents('.item');
        const itemId = li.attr('data-container-id') ?? '';
        const item = this.actor.getOwnedItem(itemId);
        if (!item) {
            return;
        }

        // Render confirmation modal dialog
        renderTemplate('systems/pf2e/templates/actors/delete-spellcasting-dialog.html').then((html) => {
            new Dialog({
                title: 'Delete Confirmation',
                content: html,
                buttons: {
                    Yes: {
                        icon: '<i class="fa fa-check"></i>',
                        label: 'Yes',
                        callback: async () => {
                            console.debug('PF2e System | Deleting Spell Container: ', item.name);
                            // Delete all child objects
                            const itemsToDelete = [];
                            for (const i of this.actor.data.items) {
                                if (i.type === 'spell') {
                                    if (i.data.location.value === itemId) {
                                        itemsToDelete.push(i._id);
                                    }
                                }
                            }

                            await this.actor.deleteOwnedItem(itemsToDelete);

                            // Delete item container
                            await this.actor.deleteOwnedItem(item.id);
                            li.slideUp(200, () => this.render(false));
                        },
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: 'Cancel',
                    },
                },
                default: 'Yes',
            }).render(true);
        });
    }

    private onAddCoinsPopup(event: JQuery.ClickEvent) {
        event.preventDefault();
        new AddCoinsPopup(this.actor, {}).render(true);
    }

    private onRemoveCoinsPopup(event: JQuery.ClickEvent) {
        event.preventDefault();
        new RemoveCoinsPopup(this.actor, {}).render(true);
    }

    private onSellAllTreasure(event: JQuery.ClickEvent) {
        event.preventDefault();
        // Render confirmation modal dialog
        renderTemplate('systems/pf2e/templates/actors/sell-all-treasure-dialog.html').then((html) => {
            new Dialog({
                title: game.i18n.localize('PF2E.SellAllTreasureTitle'),
                content: html,
                buttons: {
                    Yes: {
                        icon: '<i class="fa fa-check"></i>',
                        label: 'Yes',
                        callback: async () => {
                            console.debug('PF2e System | Selling all treasure: ', this.actor);
                            sellAllTreasure(this.actor);
                        },
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: 'Cancel',
                    },
                },
                default: 'Yes',
            }).render(true);
        });
    }

    private onTraitSelector(event: JQuery.ClickEvent) {
        event.preventDefault();
        const a = $(event.currentTarget);
        const options = {
            name: a.parents('label').attr('for'),
            title: a.parent().text().trim(),
            choices: CONFIG.PF2E[a.attr('data-options') as keyof ConfigPF2e['PF2E']],
            has_values: a.attr('data-has-values') === 'true',
            allow_empty_values: a.attr('data-allow-empty-values') === 'true',
            has_exceptions: a.attr('data-has-exceptions') === 'true',
        };
        new TraitSelector5e(this.actor, options).render(true);
    }

    protected onCrbTraitSelector(event: JQuery.ClickEvent) {
        event.preventDefault();
        const a = $(event.currentTarget);
        const options = {
            name: a.parents('li').attr('for'),
            title: a.parent().parent().siblings('h4').text().trim(),
            choices: CONFIG.PF2E[a.attr('data-options') as keyof ConfigPF2e['PF2E']],
            has_values: a.attr('data-has-values') === 'true',
            allow_empty_values: a.attr('data-allow-empty-values') === 'true',
            has_exceptions: a.attr('data-has-exceptions') === 'true',
        };
        new TraitSelector5e(this.actor, options).render(true);
    }

    // // To be put back in use later?
    // private onAreaEffect(event: JQuery.ClickEvent) {
    //     const areaType = $(event.currentTarget).attr('data-area-areaType');
    //     const areaSize = Number($(event.currentTarget).attr('data-area-size') ?? 0);

    //     let tool = 'cone';
    //     if (areaType === 'burst') tool = 'circle';
    //     else if (areaType === 'emanation') tool = 'rect';
    //     else if (areaType === 'line') tool = 'ray';

    //     // Delete any existing templates for this actor.
    //     let templateData = this.actor.getFlag('pf2e', 'areaEffectId') || null;
    //     let templateScene = null;
    //     if (templateData) {
    //         templateScene = this.actor.getFlag('pf2e', 'areaEffectScene') || null;
    //         this.actor.setFlag('pf2e', 'areaEffectId', null);
    //         this.actor.setFlag('pf2e', 'areaEffectScene', null);

    //         console.log(`PF2e | Existing MeasuredTemplate ${templateData.id} from Scene ${templateScene} found`);
    //         if (canvas.scene && canvas.templates.objects.children) {
    //             for (const placeable of canvas.templates.objects.children) {
    //                 console.log(
    //                     `PF2e | Placeable Found - id: ${placeable.data._id}, scene: ${canvas.scene._id}, type: ${placeable.constructor.name}`,
    //                 );
    //                 if (
    //                     placeable.data._id === templateData.id &&
    //                     canvas.scene._id === templateScene &&
    //                     placeable.constructor.name === 'MeasuredTemplate'
    //                 ) {
    //                     console.log(`PF2e | Deleting MeasuredTemplate ${templateData.id} from Scene ${templateScene}`);

    //                     const existingTemplate = new MeasuredTemplate(templateData, templateScene);
    //                     existingTemplate.delete(templateScene);
    //                 }
    //             }
    //         }
    //     }

    //     // data to pull in dynamically
    //     let x;
    //     let y;

    //     let data = {};
    //     const gridWidth = canvas.grid.grid.w;

    //     if (areaType === 'emanation' || areaType === 'cone') {
    //         if (canvas.tokens.controlled.length > 1) {
    //             ui.notifications.info('Please select a single target token');
    //         } else if (canvas.tokens.controlled.length === 0) {
    //             ui.notifications.info('Please select a target token');
    //         } else {
    //             const t = canvas.tokens.controlled[0];
    //             let { rotation } = t.data;
    //             const { width } = t.data;

    //             x = t.data.x;
    //             y = t.data.y;

    //             // Cone placement logic
    //             if (tool === 'cone') {
    //                 if (rotation < 0) rotation = 360 + rotation;
    //                 if (rotation < 35) {
    //                     x += gridWidth / 2;
    //                     y += gridWidth;
    //                 } else if (rotation < 55) {
    //                     y += gridWidth;
    //                 } else if (rotation < 125) {
    //                     y += gridWidth / 2;
    //                 } else if (rotation < 145) {
    //                     // y = y;
    //                 } else if (rotation < 215) {
    //                     x += gridWidth / 2;
    //                 } else if (rotation < 235) {
    //                     x += gridWidth;
    //                 } else if (rotation < 305) {
    //                     x += gridWidth;
    //                     y += gridWidth / 2;
    //                 } else if (rotation < 325) {
    //                     x += gridWidth;
    //                     y += gridWidth;
    //                 } else {
    //                     x += gridWidth / 2;
    //                     y += gridWidth;
    //                 }
    //                 rotation += 90;

    //                 data = {
    //                     t: tool,
    //                     x,
    //                     y,
    //                     distance: areaSize,
    //                     direction: rotation,
    //                     fillColor: game.user.data.color || '#FF0000',
    //                 };
    //             } else if (tool === 'rect') {
    //                 x -= gridWidth * (areaSize / 5);
    //                 y -= gridWidth * (areaSize / 5);
    //                 rotation = 45;

    //                 const rectSide = areaSize + width * 5 + areaSize;
    //                 const distance = Math.sqrt(rectSide ** 2 + rectSide ** 2);
    //                 data = {
    //                     t: tool,
    //                     x,
    //                     y,
    //                     distance,
    //                     direction: rotation,
    //                     fillColor: game.user.data.color || '#FF0000',
    //                 };
    //             }

    //             // Create the template
    //             MeasuredTemplate.create(data).then((results) => {
    //                 templateData = results.data;

    //                 // Save MeasuredTemplate information to actor flags
    //                 this.actor.setFlag('pf2e', 'areaEffectId', templateData);
    //                 this.actor.setFlag('pf2e', 'areaEffectScene', canvas.scene!._id);
    //             });
    //         }
    //     }
    // }

    /** @override */
    protected async _onSubmit(event: Event, options: OnSubmitFormOptions = {}): Promise<Record<string, unknown>> {
        // Limit HP value to data.attributes.hp.max value
        if (!(event.currentTarget instanceof HTMLInputElement)) {
            return super._onSubmit(event, options);
        }

        const $target = $(event.currentTarget ?? {});
        if ($target.attr('name') === 'data.attributes.hp.value') {
            $target.attr({
                value: Math.clamped(
                    parseInt($target.attr('value') ?? '0', 10),
                    0,
                    this.actor.data.data.attributes.hp?.max ?? 0,
                ),
            });
        }

        return super._onSubmit(event, options);
    }
}
