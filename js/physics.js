window.NJOX = window.NJOX || {};

NJOX.Physics = {
    accumulator: 0,

    // Main physics update with fixed timestep
    update(dt, ballManager, creatures, onCreatureHit) {
        this.accumulator += dt;
        while (this.accumulator >= NJOX.PHYSICS_STEP) {
            this._step(NJOX.PHYSICS_STEP, ballManager, creatures, onCreatureHit);
            this.accumulator -= NJOX.PHYSICS_STEP;
        }
    },

    reset() {
        this.accumulator = 0;
    },

    _step(dt, ballManager, creatures, onCreatureHit) {
        for (const ball of ballManager.balls) {
            if (!ball.active) continue;

            ball.x += ball.vx * dt;
            ball.y += ball.vy * dt;

            // Wall bounces
            if (ball.x - ball.radius < 0) {
                ball.x = ball.radius;
                ball.vx = Math.abs(ball.vx);
                ball.wallBounces++;
                NJOX.Sound.wallBounceRateLimited();
            } else if (ball.x + ball.radius > NJOX.CANVAS_W) {
                ball.x = NJOX.CANVAS_W - ball.radius;
                ball.vx = -Math.abs(ball.vx);
                ball.wallBounces++;
                NJOX.Sound.wallBounceRateLimited();
            }

            // Ceiling bounce — HUD altından sek (toplar HUD'a girmesin)
            const TOP_LIMIT = 32;
            if (ball.y - ball.radius < TOP_LIMIT) {
                ball.y = TOP_LIMIT + ball.radius;
                ball.vy = Math.abs(ball.vy);
                ball.wallBounces = 0;
                NJOX.Sound.wallBounceRateLimited();
            }

            // Stuck detection: 10 consecutive side-wall bounces → force return
            if (ball.wallBounces >= 10) {
                ball.active = false;
                ballManager.onBallLand(ball);
                continue;
            }

            // Floor — ball returns (only when moving downward)
            if (ball.vy > 0 && ball.y + ball.radius > NJOX.FLOOR_Y) {
                ball.y = NJOX.FLOOR_Y;
                ball.active = false;
                ballManager.onBallLand(ball);
                continue;
            }

            // Creature collisions
            for (let i = creatures.length - 1; i >= 0; i--) {
                const c = creatures[i];
                if (!c.alive) continue;

                const col = NJOX.Utils.circleVsRect(
                    ball.x, ball.y, ball.radius,
                    c.x, c.y, c.w, c.h
                );

                if (!col) continue;

                // Hit a creature — reset wall-stuck counter (ball made real contact)
                ball.wallBounces = 0;

                // Apply ball type modifier
                const baseDmg = ballManager.getDamage();
                const ballDmg = ball.getDamageMultiplier ? ball.getDamageMultiplier() : 1;
                const result = c.onHit(ball, col.face, baseDmg * ballDmg);

                // Ice effect: freeze creature
                if (ball.type === 'ice' && c.alive) {
                    c.frozen = true;
                }

                // Vampire drain: reduce total ball count by 1
                if (result && result.drained) {
                    ballManager.totalCount = Math.max(1, ballManager.totalCount - 1);
                    NJOX.Sound.vampireDrain();
                }

                // Bomb AoE: deal 1 damage to all creatures within 65px
                if (ball.type === 'bomb' && result && !result.absorbed) {
                    const bcx = c.x + c.w / 2;
                    const bcy = c.y + c.h / 2;
                    for (const nearby of creatures) {
                        if (!nearby.alive || nearby === c) continue;
                        const dx = (nearby.x + nearby.w / 2) - bcx;
                        const dy = (nearby.y + nearby.h / 2) - bcy;
                        if (dx * dx + dy * dy < 65 * 65) {
                            nearby.hp -= 1;
                            nearby.hitFlashTimer = 0.12;
                            if (nearby.hp <= 0) {
                                nearby.hp = 0;
                                nearby.alive = false;
                                nearby.animState = 'death';
                                nearby.deathTimer = 0.3;
                            }
                        }
                    }
                    NJOX.Sound.bombExplode();
                }

                // Hit sound (rate-limited) — boss has deeper thud, combo pitch shift
                if (c.type === 'boss') {
                    NJOX.Sound.bossHit();
                } else {
                    NJOX.Sound.ballHitRateLimited(ball.type, NJOX._shotKills || 0);
                }

                if (result && result.absorbed) {
                    // Ball gets absorbed
                    ball.active = false;
                    ballManager.onBallLand(ball);
                } else if (!ball.pierce) {
                    // Reflect ball
                    ball.x += col.nx * col.overlap;
                    ball.y += col.ny * col.overlap;
                    // Reflect velocity
                    const dot = NJOX.Utils.dot(ball.vx, ball.vy, col.nx, col.ny);
                    ball.vx -= 2 * dot * col.nx;
                    ball.vy -= 2 * dot * col.ny;
                } else {
                    // Pierce — just separate without reflecting
                    ball.x += col.nx * col.overlap;
                    ball.y += col.ny * col.overlap;
                }

                // Callback for hit effects (pass actual damage dealt for floating numbers)
                if (onCreatureHit) {
                    onCreatureHit(c, col, ball, Math.round(baseDmg * ballDmg));
                }

                // Only hit one creature per step per ball (avoid multi-hit glitches)
                if (!ball.pierce) break;
            }

            // Ensure speed stays constant (correct floating point drift)
            const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
            if (speed > 0 && Math.abs(speed - NJOX.BALL_SPEED) > 1) {
                const ratio = NJOX.BALL_SPEED / speed;
                ball.vx *= ratio;
                ball.vy *= ratio;
            }
        }
    }
};
