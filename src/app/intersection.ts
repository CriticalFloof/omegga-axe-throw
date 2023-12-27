import { Brick, Vector } from "omegga";

function getIntersection(distance1: number, distance2: number, linePoint1: Vector, linePoint2: Vector, hit: { point: Vector }): boolean {
    if (distance1 * distance2 >= 0) return false;
    if (distance1 === distance2) return false;

    hit.point = [
        linePoint1[0] + (linePoint2[0] - linePoint1[0]) * (-distance1 / (distance2 - distance1)),
        linePoint1[1] + (linePoint2[1] - linePoint1[1]) * (-distance1 / (distance2 - distance1)),
        linePoint1[2] + (linePoint2[2] - linePoint1[2]) * (-distance1 / (distance2 - distance1)),
    ];
    return true;
}

function inBox(h: { point: Vector }, boxMin: Vector, boxMax: Vector, axis: number): boolean {
    const hit = h.point;
    if (axis === 0 && hit[2] > boxMin[2] && hit[2] < boxMax[2] && hit[1] > boxMin[1] && hit[1] < boxMax[1]) return true;
    if (axis === 1 && hit[2] > boxMin[2] && hit[2] < boxMax[2] && hit[0] > boxMin[0] && hit[0] < boxMax[0]) return true;
    if (axis === 2 && hit[0] > boxMin[0] && hit[0] < boxMax[0] && hit[1] > boxMin[1] && hit[1] < boxMax[1]) return true;
    return false;
}

export function checkLineBox(brick: Brick, line: [Vector, Vector], hit: { point: Vector }): boolean {
    const boxMin: Vector = [brick.position[0] - brick.size[0], brick.position[1] - brick.size[1], brick.position[2] - brick.size[2]];
    const boxMax: Vector = [brick.position[0] + brick.size[0], brick.position[1] + brick.size[1], brick.position[2] + brick.size[2]];

    const linePoint1 = line[0];
    const linePoint2 = line[1];

    if (linePoint2[0] < boxMin[0] && linePoint1[0] < boxMin[0]) return false;
    if (linePoint2[0] > boxMax[0] && linePoint1[0] > boxMax[0]) return false;
    if (linePoint2[1] < boxMin[1] && linePoint1[1] < boxMin[1]) return false;
    if (linePoint2[1] > boxMax[1] && linePoint1[1] > boxMax[1]) return false;
    if (linePoint2[2] < boxMin[2] && linePoint1[2] < boxMin[2]) return false;
    if (linePoint2[2] > boxMax[2] && linePoint1[2] > boxMax[2]) return false;

    if (
        linePoint1[0] > boxMin[0] &&
        linePoint1[0] < boxMax[0] &&
        linePoint1[1] > boxMin[1] &&
        linePoint1[1] < boxMax[1] &&
        linePoint1[2] > boxMin[2] &&
        linePoint1[2] < boxMax[2]
    ) {
        hit.point = linePoint1;
        return true;
    }

    if (
        (getIntersection(linePoint1[0] - boxMin[0], linePoint2[0] - boxMin[0], linePoint1, linePoint2, hit) && inBox(hit, boxMin, boxMax, 0)) ||
        (getIntersection(linePoint1[1] - boxMin[1], linePoint2[1] - boxMin[1], linePoint1, linePoint2, hit) && inBox(hit, boxMin, boxMax, 1)) ||
        (getIntersection(linePoint1[2] - boxMin[2], linePoint2[2] - boxMin[2], linePoint1, linePoint2, hit) && inBox(hit, boxMin, boxMax, 2)) ||
        (getIntersection(linePoint1[0] - boxMax[0], linePoint2[0] - boxMax[0], linePoint1, linePoint2, hit) && inBox(hit, boxMin, boxMax, 0)) ||
        (getIntersection(linePoint1[1] - boxMax[1], linePoint2[1] - boxMax[1], linePoint1, linePoint2, hit) && inBox(hit, boxMin, boxMax, 1)) ||
        (getIntersection(linePoint1[2] - boxMax[2], linePoint2[2] - boxMax[2], linePoint1, linePoint2, hit) && inBox(hit, boxMin, boxMax, 2))
    ) {
        return true;
    }

    return false;
}
