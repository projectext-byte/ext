import { Player } from '../../core.js';
import { ActionFormData } from "../../core.js";
 
const formatAnimationName = str => str.split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
const animationConfig = {
    "penguin_dance": { id: "animation.club_penguin", loop: false },
    "piglin_celebration": { id: "animation.piglin.celebrate_hunt_special", loop: 50 }, 
    "doodle_dance": { id: "animation.doodle_dance", loop: false },
    "snow_angel": { id: "animation.snow_angel", loop: false },
    "dab": { id: "animation.dab_dance", loop: false },
    "floss_dance": { id: "animation.floss_dance", loop: false },
    "laugh": { id: "animation.laugh", loop: false },
    "sad": { id: "animation.sad", loop: false },
    "rat_dance": { id: "animation.rat_dance", loop: false },
    "nop": { id: "animation.nop", loop: false },
    "buggie_dance": { id: "animation.buggie_dance", loop: false },
    "jojo_pose": { id: "animation.jojo_pose", loop: false },
    "hakari_dance": { id: "animation.hakari_dance", loop: false },
    "griddy": { id: "animation.griddy", loop: false },
    "kazoch_kick": { id: "animation.kazoch_kick", loop: false },
    "cute_dance": { id: "animation.cute_dance", loop: false },
    "bored": { id: "animation.react_bored_1", loop: false },
    "react_bottom": { id: "animation.react_bottom_1", loop: false },
};
export function showEmoteUI(player) {
    const keys = Object.keys(animationConfig);
    const form = new ActionFormData().title('Emotes')
        .body('Select the emote you want to use:');
    keys.forEach(key => form.button(formatAnimationName(key), `textures/emotes/${key}`));
    form.show(player).then(formData => {
        if (formData.canceled) {
            player.playSound('beacon.deactivate');
            return;
        }
        const selectedKey = keys[formData.selection];
        const animation = animationConfig[selectedKey];
        let stopExpression;
        if (typeof animation.loop === 'number') {
            stopExpression = `(q.is_moving || query.anim_time > ${animation.loop})`;
        } else if (animation.loop) { 
            stopExpression = '(q.is_moving)';
        } else { 
            stopExpression = '(q.is_moving || query.all_animations_finished)';
        }
        player.playAnimation(animation.id, { stopExpression });
    });
}