import { ActorPF2e, SKILL_DICTIONARY, SKILL_EXPANDED } from './base';
import { ItemPF2e } from '@item/base';
import { CheckModifier, ModifierPF2e, ModifierType, StatisticModifier } from '../modifiers';
import { PF2WeaponDamage } from '../system/damage/weapon';
import { CheckPF2e, PF2DamageRoll } from '../system/rolls';
import { CharacterStrike, CharacterStrikeTrait, NPCData } from './data-definitions';
import { RuleElements } from '../rules/rules';
import { PF2RollNote } from '../notes';
import { adaptRoll } from '@system/rolls';
import { CreaturePF2e } from '@actor/creature';

export class NPCPF2e extends CreaturePF2e {
    data!: NPCData;
    _data!: NPCData;

    /** @override */
    static readonly type = 'npc';

    /** Prepare Character type specific data. */
    prepareDerivedData(): void {
        super.prepareDerivedData();
        const actorData = this.data;
        const { data } = actorData;

        const rules = actorData.items.reduce(
            (accumulated, current) => accumulated.concat(RuleElements.fromOwnedItem(current)),
            [],
        );

        // Toggles
        (data as any).toggles = {
            actions: [
                {
                    label: 'PF2E.TargetFlatFootedLabel',
                    inputName: `flags.${game.system.id}.rollOptions.all.target:flatFooted`,
                    checked: this.getFlag(game.system.id, 'rollOptions.all.target:flatFooted'),
                },
            ],
        };

        const { statisticsModifiers, damageDice, strikes, rollNotes } = this._prepareCustomModifiers(actorData, rules);

        // Compute 'fake' ability scores from ability modifiers (just in case the scores are required for something)
        for (const abl of Object.values(actorData.data.abilities)) {
            abl.mod = Number(abl.mod ?? 0); // ensure the modifier is never a string
            abl.value = abl.mod * 2 + 10;
        }

        // Speeds
        {
            const label = game.i18n.localize('PF2E.SpeedTypesLand');
            const base = parseInt(data.attributes.speed.value, 10) || 0;
            const modifiers: ModifierPF2e[] = [];
            ['land-speed', 'speed'].forEach((key) => {
                (statisticsModifiers[key] || []).map((m) => duplicate(m)).forEach((m) => modifiers.push(m));
            });
            const stat = mergeObject(
                new StatisticModifier(game.i18n.format('PF2E.SpeedLabel', { type: label }), modifiers),
                data.attributes.speed,
                { overwrite: false },
            );
            stat.total = base + stat.totalModifier;
            stat.type = 'land';
            stat.breakdown = [`${game.i18n.format('PF2E.SpeedBaseLabel', { type: label })} ${base}`]
                .concat(
                    stat.modifiers
                        .filter((m) => m.enabled)
                        .map((m) => `${game.i18n.localize(m.name)} ${m.modifier < 0 ? '' : '+'}${m.modifier}`),
                )
                .join(', ');
            data.attributes.speed = stat;
        }
        for (let idx = 0; idx < data.attributes.speed.otherSpeeds.length; idx++) {
            const speed = data.attributes.speed.otherSpeeds[idx];
            const base = typeof speed.value === 'string' ? parseInt(speed.value, 10) || 0 : 0;
            const modifiers: ModifierPF2e[] = [];
            [`${speed.type.toLowerCase()}-speed`, 'speed'].forEach((key) => {
                (statisticsModifiers[key] || []).map((m) => duplicate(m)).forEach((m) => modifiers.push(m));
            });
            const stat = mergeObject(
                new StatisticModifier(game.i18n.format('PF2E.SpeedLabel', { type: speed.type }), modifiers),
                speed,
                { overwrite: false },
            );
            stat.total = base + stat.totalModifier;
            stat.breakdown = [`${game.i18n.format('PF2E.SpeedBaseLabel', { type: speed.type })} ${base}`]
                .concat(
                    stat.modifiers
                        .filter((m) => m.enabled)
                        .map((m) => `${game.i18n.localize(m.name)} ${m.modifier < 0 ? '' : '+'}${m.modifier}`),
                )
                .join(', ');
            data.attributes.speed.otherSpeeds[idx] = stat;
        }

        // Armor Class
        {
            const base: number = data.attributes.ac.base ?? Number(data.attributes.ac.value);
            const dexterity = Math.min(
                data.abilities.dex.mod,
                ...(data.attributes.dexCap ?? []).map((cap) => cap.value),
            );
            const modifiers = [
                new ModifierPF2e('PF2E.BaseModifier', base - 10 - dexterity, ModifierType.UNTYPED),
                new ModifierPF2e(CONFIG.PF2E.abilities.dex, dexterity, ModifierType.ABILITY),
            ];
            ['ac', 'dex-based', 'all'].forEach((key) => {
                (statisticsModifiers[key] || []).map((m) => duplicate(m)).forEach((m) => modifiers.push(m));
            });

            const stat = mergeObject(new StatisticModifier('ac', modifiers), data.attributes.ac, {
                overwrite: false,
            });
            stat.base = base;
            stat.value = 10 + stat.totalModifier;
            stat.breakdown = [game.i18n.localize('PF2E.ArmorClassBase')]
                .concat(
                    stat.modifiers
                        .filter((m) => m.enabled)
                        .map((m) => `${game.i18n.localize(m.name)} ${m.modifier < 0 ? '' : '+'}${m.modifier}`),
                )
                .join(', ');

            data.attributes.ac = stat;
        }

        // Saving Throws
        for (const [saveName, save] of Object.entries(data.saves as Record<string, any>)) {
            const base: number = save.base ?? Number(save.value);
            const modifiers = [
                new ModifierPF2e('PF2E.BaseModifier', base - data.abilities[save.ability].mod, ModifierType.UNTYPED),
                new ModifierPF2e(
                    CONFIG.PF2E.abilities[save.ability],
                    data.abilities[save.ability].mod,
                    ModifierType.ABILITY,
                ),
            ];
            const notes = [] as PF2RollNote[];
            [saveName, `${save.ability}-based`, 'saving-throw', 'all'].forEach((key) => {
                (statisticsModifiers[key] || []).map((m) => duplicate(m)).forEach((m) => modifiers.push(m));
                (rollNotes[key] ?? []).map((n) => duplicate(n)).forEach((n) => notes.push(n));
            });

            const stat = mergeObject(new StatisticModifier(saveName, modifiers), save, {
                overwrite: false,
            });
            stat.base = base;
            stat.value = stat.totalModifier;
            stat.breakdown = stat.modifiers
                .filter((m) => m.enabled)
                .map((m) => `${game.i18n.localize(m.name)} ${m.modifier < 0 ? '' : '+'}${m.modifier}`)
                .join(', ');
            stat.roll = (event, options = [], callback?) => {
                const label = game.i18n.format('PF2E.SavingThrowWithName', {
                    saveName: game.i18n.localize(CONFIG.PF2E.saves[saveName]),
                });
                CheckPF2e.roll(
                    new CheckModifier(label, stat),
                    { actor: this, type: 'saving-throw', options, notes },
                    event,
                    callback,
                );
            };

            data.saves[saveName] = stat;
        }

        // Perception
        {
            const base: number = data.attributes.perception.base ?? Number(data.attributes.perception.value);
            const modifiers = [
                new ModifierPF2e('PF2E.BaseModifier', base - data.abilities.wis.mod, ModifierType.UNTYPED),
                new ModifierPF2e(CONFIG.PF2E.abilities.wis, data.abilities.wis.mod, ModifierType.ABILITY),
            ];
            const notes = [] as PF2RollNote[];
            ['perception', 'wis-based', 'all'].forEach((key) => {
                (statisticsModifiers[key] || []).map((m) => duplicate(m)).forEach((m) => modifiers.push(m));
                (rollNotes[key] ?? []).map((n) => duplicate(n)).forEach((n) => notes.push(n));
            });

            const stat = mergeObject(new StatisticModifier('perception', modifiers), data.attributes.perception, {
                overwrite: false,
            });
            stat.base = base;
            stat.value = stat.totalModifier;
            stat.breakdown = stat.modifiers
                .filter((m) => m.enabled)
                .map((m) => `${game.i18n.localize(m.name)} ${m.modifier < 0 ? '' : '+'}${m.modifier}`)
                .join(', ');
            stat.roll = adaptRoll((args) => {
                const label = game.i18n.localize('PF2E.PerceptionCheck');
                CheckPF2e.roll(
                    new CheckModifier(label, stat),
                    { actor: this, type: 'perception-check', options: args.options ?? [], notes },
                    args.event,
                    args.callback,
                );
            });

            data.attributes.perception = stat;
        }

        // default all skills to untrained
        data.skills = {};
        for (const [skill, { ability, shortform }] of Object.entries(SKILL_EXPANDED)) {
            const modifiers = [
                new ModifierPF2e('PF2E.BaseModifier', 0, ModifierType.UNTYPED),
                new ModifierPF2e(CONFIG.PF2E.abilities[ability], data.abilities[ability].mod, ModifierType.ABILITY),
            ];
            const notes = [] as PF2RollNote[];
            [skill, `${ability}-based`, 'skill-check', 'all'].forEach((key) => {
                (statisticsModifiers[key] || []).map((m) => duplicate(m)).forEach((m) => modifiers.push(m));
                (rollNotes[key] ?? []).map((n) => duplicate(n)).forEach((n) => notes.push(n));
            });

            const name = game.i18n.localize(`PF2E.Skill${SKILL_DICTIONARY[shortform].capitalize()}`);
            const stat = mergeObject(
                new StatisticModifier(name, modifiers),
                {
                    ability,
                    expanded: skill,
                    label: name,
                    visible: false,
                },
                { overwrite: false },
            );
            stat.lore = false;
            stat.rank = 0; // default to untrained
            stat.value = stat.totalModifier;
            stat.breakdown = stat.modifiers
                .filter((m) => m.enabled)
                .map((m) => `${game.i18n.localize(m.name)} ${m.modifier < 0 ? '' : '+'}${m.modifier}`)
                .join(', ');
            stat.roll = (event, options = [], callback?) => {
                const label = game.i18n.format('PF2E.SkillCheckWithName', { skillName: name });
                CheckPF2e.roll(
                    new CheckModifier(label, stat),
                    { actor: this, type: 'skill-check', options, notes },
                    event,
                    callback,
                );
            };
            data.skills[shortform] = stat;
        }

        // Automatic Actions
        data.actions = [];

        // process OwnedItem instances, which for NPCs include skills, attacks, equipment, special abilities etc.
        for (const item of actorData.items.concat(strikes)) {
            if (item.type === 'lore') {
                // override untrained skills if defined in the NPC data
                const skill = item.name.slugify(); // normalize skill name to lower-case and dash-separated words
                // assume lore, if skill cannot be looked up
                const { ability, shortform } = SKILL_EXPANDED[skill] ?? { ability: 'int', shortform: skill };

                const base: number = (item.data.mod as any).base ?? Number(item.data.mod.value);
                const modifiers = [
                    new ModifierPF2e('PF2E.BaseModifier', base - data.abilities[ability].mod, ModifierType.UNTYPED),
                    new ModifierPF2e(CONFIG.PF2E.abilities[ability], data.abilities[ability].mod, ModifierType.ABILITY),
                ];
                const notes = [] as PF2RollNote[];
                [skill, `${ability}-based`, 'skill-check', 'all'].forEach((key) => {
                    (statisticsModifiers[key] || []).map((m) => duplicate(m)).forEach((m) => modifiers.push(m));
                    (rollNotes[key] ?? []).map((n) => duplicate(n)).forEach((n) => notes.push(n));
                });

                const stat = mergeObject(new StatisticModifier(item.name, modifiers), data.skills[shortform], {
                    overwrite: false,
                });
                stat.itemID = item._id;
                stat.base = base;
                stat.expanded = skill;
                stat.label = item.name;
                stat.lore = !SKILL_EXPANDED[skill];
                stat.rank = 1; // default to trained
                stat.value = stat.totalModifier;
                stat.visible = true;
                stat.breakdown = stat.modifiers
                    .filter((m) => m.enabled)
                    .map((m) => `${game.i18n.localize(m.name)} ${m.modifier < 0 ? '' : '+'}${m.modifier}`)
                    .join(', ');
                stat.roll = adaptRoll((args) => {
                    const label = game.i18n.format('PF2E.SkillCheckWithName', { skillName: item.name });
                    CheckPF2e.roll(
                        new CheckModifier(label, stat),
                        { actor: this, type: 'skill-check', options: args.options ?? [], dc: args.dc, notes },
                        args.event,
                        args.callback,
                    );
                });

                const variants = (item.data as any).variants;
                if (variants && Object.keys(variants).length) {
                    stat.variants = [];
                    for (const [, variant] of Object.entries(variants)) {
                        stat.variants.push(variant);
                    }
                }

                data.skills[shortform] = stat;
            } else if (item.type === 'melee') {
                const modifiers: ModifierPF2e[] = [];
                const notes = [] as PF2RollNote[];

                // traits
                const traits = item.data.traits.value;

                // Determine the base ability score for this attack.
                let ability: string;
                {
                    ability = (item.data as any).weaponType?.value === 'ranged' ? 'dex' : 'str';
                    const bonus = Number(item.data?.bonus?.value ?? 0);
                    if (traits.includes('finesse')) {
                        ability = 'dex';
                    } else if (traits.includes('brutal')) {
                        ability = 'str';
                    }
                    modifiers.push(
                        new ModifierPF2e(
                            'PF2E.BaseModifier',
                            bonus - data.abilities[ability].mod,
                            ModifierType.UNTYPED,
                        ),
                        new ModifierPF2e(
                            CONFIG.PF2E.abilities[ability],
                            data.abilities[ability].mod,
                            ModifierType.ABILITY,
                        ),
                    );
                }

                // Conditions and Custom modifiers to attack rolls
                {
                    const stats: string[] = [];
                    stats.push(`${item.name.replace(/\s+/g, '-').toLowerCase()}-attack`); // convert white spaces to dash and lower-case all letters
                    stats
                        .concat([
                            'attack',
                            `${ability}-attack`,
                            `${ability}-based`,
                            `${item._id}-attack`,
                            'attack-roll',
                            'all',
                        ])
                        .forEach((key) => {
                            (statisticsModifiers[key] || []).map((m) => duplicate(m)).forEach((m) => modifiers.push(m));
                            (rollNotes[key] ?? []).map((n) => duplicate(n)).forEach((n) => notes.push(n));
                        });
                }

                // action image
                const { imageUrl, actionGlyph } = ActorPF2e.getActionGraphics(
                    (item as any).data?.actionType?.value || 'action',
                    parseInt(((item as any).data?.actions || {}).value, 10) || 1,
                );

                const action = new StatisticModifier(item.name, modifiers) as CharacterStrike;
                action.glyph = actionGlyph;
                action.imageUrl = imageUrl;
                action.type = 'strike';
                action.attackRollType =
                    (item.data as any).weaponType?.value === 'ranged' ? 'PF2E.NPCAttackRanged' : 'PF2E.NPCAttackMelee';
                action.breakdown = action.modifiers
                    .filter((m) => m.enabled)
                    .map((m) => `${game.i18n.localize(m.name)} ${m.modifier < 0 ? '' : '+'}${m.modifier}`)
                    .join(', ');

                action.traits = [
                    { name: 'attack', label: game.i18n.localize('PF2E.TraitAttack'), toggle: false },
                ].concat(
                    traits.map((trait) => {
                        const key = CONFIG.PF2E.weaponTraits[trait] ?? trait;
                        const option: CharacterStrikeTrait = {
                            name: trait,
                            label: key,
                            toggle: false,
                        };
                        return option;
                    }),
                );

                // Add the base attack roll (used for determining on-hit)
                action.attack = adaptRoll((args) => {
                    const options = (args.options ?? []).concat(item.data.traits.value); // always add all weapon traits as options
                    CheckPF2e.roll(
                        new CheckModifier(`Strike: ${action.name}`, action),
                        { actor: this, type: 'attack-roll', options, notes, dc: args.dc },
                        args.event,
                    );
                });
                action.roll = action.attack;

                const map = ItemPF2e.calculateMap(item);
                action.variants = [
                    {
                        label: `Strike ${action.totalModifier < 0 ? '' : '+'}${action.totalModifier}`,
                        roll: adaptRoll((args) => {
                            const options = (args.options ?? []).concat(item.data.traits.value); // always add all weapon traits as options
                            CheckPF2e.roll(
                                new CheckModifier(`Strike: ${action.name}`, action),
                                { actor: this, type: 'attack-roll', options, notes, dc: args.dc },
                                args.event,
                            );
                        }),
                    },
                    {
                        label: `MAP ${map.map2}`,
                        roll: adaptRoll((args) => {
                            const options = (args.options ?? []).concat(item.data.traits.value); // always add all weapon traits as options
                            CheckPF2e.roll(
                                new CheckModifier(`Strike: ${action.name}`, action, [
                                    new ModifierPF2e('PF2E.MultipleAttackPenalty', map.map2, ModifierType.UNTYPED),
                                ]),
                                { actor: this, type: 'attack-roll', options, notes, dc: args.dc },
                                args.event,
                            );
                        }),
                    },
                    {
                        label: `MAP ${map.map3}`,
                        roll: adaptRoll((args) => {
                            const options = (args.options ?? []).concat(item.data.traits.value); // always add all weapon traits as options
                            CheckPF2e.roll(
                                new CheckModifier(`Strike: ${action.name}`, action, [
                                    new ModifierPF2e('PF2E.MultipleAttackPenalty', map.map3, ModifierType.UNTYPED),
                                ]),
                                { actor: this, type: 'attack-roll', options, notes, dc: args.dc },
                                args.event,
                            );
                        }),
                    },
                ];
                action.damage = adaptRoll((args) => {
                    const options = (args.options ?? []).concat(item.data.traits.value); // always add all weapon traits as options
                    const damage = PF2WeaponDamage.calculateStrikeNPC(
                        item,
                        actorData,
                        action.traits,
                        statisticsModifiers,
                        damageDice,
                        1,
                        options,
                        rollNotes,
                    );
                    PF2DamageRoll.roll(
                        damage,
                        { type: 'damage-roll', outcome: 'success', options },
                        args.event,
                        args.callback,
                    );
                });
                action.critical = adaptRoll((args) => {
                    const options = (args.options ?? []).concat(item.data.traits.value); // always add all weapon traits as options
                    const damage = PF2WeaponDamage.calculateStrikeNPC(
                        item,
                        actorData,
                        action.traits,
                        statisticsModifiers,
                        damageDice,
                        1,
                        options,
                        rollNotes,
                    );
                    PF2DamageRoll.roll(
                        damage,
                        { type: 'damage-roll', outcome: 'criticalSuccess', options },
                        args.event,
                        args.callback,
                    );
                });

                data.actions.push(action);
            }
        }
    }

    private updateTokenAttitude(attitude: string) {
        const disposition = NPCPF2e.mapNPCAttitudeToTokenDisposition(attitude);
        const tokens = this._getTokenData();

        for (const key of Object.keys(tokens)) {
            const token = tokens[key];
            token.disposition = disposition;
        }

        const dispositionActorUpdate = {
            'token.disposition': disposition,
            attitude,
        };

        this._updateAllTokens(dispositionActorUpdate, tokens);
    }

    private static mapNPCAttitudeToTokenDisposition(attitude: string): number {
        if (attitude === null) {
            return CONST.TOKEN_DISPOSITIONS.HOSTILE;
        }

        if (attitude === 'hostile') {
            return CONST.TOKEN_DISPOSITIONS.HOSTILE;
        } else if (attitude === 'unfriendly' || attitude === 'indifferent') {
            return CONST.TOKEN_DISPOSITIONS.NEUTRAL;
        } else {
            return CONST.TOKEN_DISPOSITIONS.FRIENDLY;
        }
    }

    private static mapTokenDispositionToNPCAttitude(disposition: number): string {
        if (disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) {
            return 'friendly';
        } else if (disposition === CONST.TOKEN_DISPOSITIONS.NEUTRAL) {
            return 'indifferent';
        } else {
            return 'hostile';
        }
    }

    protected _onUpdate(data: any, options: object, userId: string, context: object) {
        super._onUpdate(data, options, userId, context);

        const attitude = data?.data?.traits?.attitude?.value;

        if (attitude && game.userId === userId) {
            this.updateTokenAttitude(attitude);
        }
    }

    public updateNPCAttitudeFromDisposition(disposition: number) {
        this.data.data.traits.attitude.value = NPCPF2e.mapTokenDispositionToNPCAttitude(disposition);
    }
}
