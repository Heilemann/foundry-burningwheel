import { TestString } from "module/helpers.js";
import { Ability, BWActor, TracksTests } from "../actor.js";
import { Skill, SkillData } from "../items/item.js";
import { rollDice, templates } from "../rolls.js";

export async function handleFateReroll(target: HTMLButtonElement): Promise<unknown> {
    const actor = game.actors.get(target.dataset.actorId || "") as BWActor;
    const accessor = target.dataset.accessor || '';
    const name = target.dataset.rollName || '';
    const itemId = target.dataset.itemId || '';
    const rollArray = target.dataset.dice?.split(',').map(s => parseInt(s, 10)) || [];
    const successes = parseInt(target.dataset.successes || "0", 10);
    const obstacleTotal = parseInt(target.dataset.difficulty || "0", 10);

    let rollStat: Ability | SkillData;
    if (target.dataset.rerollType === "stat") {
        rollStat = getProperty(actor, `data.${accessor}`);
    } else {
        rollStat = (actor.getOwnedItem(itemId) as Skill).data.data;
    }

    const successTarget = rollStat.shade === "B" ? 3 : (rollStat.shade === "G" ? 2 : 1);

    let reroll: Roll | undefined;
    if (rollStat.open) {
        // only reroll dice if there were any traitors
        const numDice = rollArray.filter(r => r <= successTarget).length ? 1 : 0;
        reroll = await rollDice(numDice, false, rollStat.shade);
    } else {
        const numDice = rollArray.filter(s => s === 6).length;
        reroll = await rollDice(numDice, true, rollStat.shade);
    }

    if (!reroll) { return; }
    const newSuccesses = parseInt(reroll.result, 10);
    const success = (newSuccesses + successes) >= obstacleTotal;

    if (actor.data.data.fate !== "0") {
        if (target.dataset.rerollType === "stat") {
            const fateSpent = parseInt(getProperty(actor, `data.${accessor}.fate`) || "0", 10);
            const updateData = {};
            updateData[`${accessor}.fate`] = fateSpent + 1;
            if (successes <= obstacleTotal && success) {
                // we turned a failure into a success. we might need to retroactively award xp.
                if (target.dataset.ptgsAction) { // shrug/grit flags may need to be set.
                    updateData[`data.ptgs.${target.dataset.ptgsAction}`] = true;
                }
                if (name === "Faith" || name === "Resources") {
                    actor.addAttributeTest(
                        getProperty(actor, `data.${accessor}`) as TracksTests,
                        name,
                        accessor,
                        target.dataset.difficultyGroup as TestString,
                        true);
                }
                if (name === "Perception") {
                    actor.addStatTest(
                        getProperty(actor, `data.${accessor}`) as TracksTests,
                        name,
                        accessor,
                        target.dataset.difficultyGroup as TestString,
                        true);
                }
            }
            actor.update(updateData);
        } else if (target.dataset.rerollType === "skill") {
            const skill = actor.getOwnedItem(itemId) as Skill;
            const fateSpent = parseInt(skill.data.data.fate, 10) || 0;
            skill.update({ 'data.fate': fateSpent + 1 }, {});
        } else if (target.dataset.rerollType === "learning") {
            const learningTarget = target.dataset.learningTarget || 'skill';
            const skill = actor.getOwnedItem(itemId) as Skill;
            if (learningTarget === 'skill') {
                // learning roll went to the root skill
                const fateSpent = parseInt(skill.data.data.fate, 10) || 0;
                skill.update({'data.fate': fateSpent + 1 }, {});
            } else {
                if (successes <= obstacleTotal && success) {
                    if (learningTarget === "perception") {
                        actor.addStatTest(
                            getProperty(actor, "data.data.perception") as TracksTests,
                            "Perception",
                            "data.perception",
                            target.dataset.difficultyGroup as TestString,
                            true);
                    }
                }
                const rootAccessor = `data.${learningTarget}.fate`;
                const rootStatFate = parseInt(getProperty(actor, `data.${rootAccessor}`), 10) || 0;
                const updateData = {};
                updateData[rootAccessor] = rootStatFate + 1;
                actor.update(updateData);
            }
        }

        const actorFateCount = parseInt(actor.data.data.fate, 10);
        actor.update({ 'data.fate': actorFateCount -1 });
    }

    const data: FateRerollMessageData = {
        rolls: rollArray.map(r => { return { roll: r, success: r > successTarget }; }),
        rerolls: reroll.dice[0].rolls,
        successes,
        obstacleTotal,
        newSuccesses,
        success
    };
    const html = await renderTemplate(templates.rerollChatMessage, data);
    return ChatMessage.create({
        content: html,
        speaker: ChatMessage.getSpeaker({actor})
    });
}


export interface FateRerollMessageData {
    rolls: { roll: number, success: boolean }[];
    rerolls: { roll: number, success: boolean }[];
    success: boolean;
    successes: number;
    newSuccesses: number;
    obstacleTotal: number;
}