import * as THREE from 'three';
import config from '../config.js';

export class Runway {
  constructor(scene) {
    this.scene = scene;

    const halfCity = (config.CITY_GRID_SIZE * config.CITY_CELL_SIZE) / 2;

    // Runway positioned beyond the south edge of the city
    this.runwayLength = 80;
    this.runwayWidth = 8;
    this.runwayZ = halfCity + 15; // Close to south edge of city
    this.runwayX = 0;
    this.startPos = new THREE.Vector3(this.runwayX, 0.5, this.runwayZ + this.runwayLength / 2 - 5);
    this.endPos = new THREE.Vector3(this.runwayX, 0.5, this.runwayZ - this.runwayLength / 2 + 5);
    this.heading = 0; // Facing north (toward city)

    this.build();
  }

  build() {
    // --- Runway surface ---
    const runwayMat = new THREE.MeshPhongMaterial({ color: 0x222233 });
    const runway = new THREE.Mesh(
      new THREE.PlaneGeometry(this.runwayWidth, this.runwayLength),
      runwayMat
    );
    runway.rotation.x = -Math.PI / 2;
    runway.position.set(this.runwayX, 0.02, this.runwayZ);
    this.scene.add(runway);

    // --- Center line (dashed) ---
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let d = -this.runwayLength / 2 + 2; d < this.runwayLength / 2 - 2; d += 4) {
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 2),
        dashMat
      );
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(this.runwayX, 0.03, this.runwayZ + d);
      this.scene.add(dash);
    }

    // --- Threshold markings (both ends) ---
    const threshMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const endSign of [-1, 1]) {
      const endZ = this.runwayZ + endSign * (this.runwayLength / 2 - 2);
      for (let i = -3; i <= 3; i++) {
        const bar = new THREE.Mesh(
          new THREE.PlaneGeometry(0.4, 3),
          threshMat
        );
        bar.rotation.x = -Math.PI / 2;
        bar.position.set(this.runwayX + i * 0.8, 0.03, endZ);
        this.scene.add(bar);
      }
    }

    // --- Edge lights ---
    const lightColors = [0x00ff88, 0xffffff, 0x00ff88];
    for (const side of [-1, 1]) {
      const edgeX = this.runwayX + side * (this.runwayWidth / 2 + 0.5);
      for (let d = -this.runwayLength / 2; d <= this.runwayLength / 2; d += 4) {
        const colorIdx = d < -this.runwayLength / 2 + 10 ? 0 : d > this.runwayLength / 2 - 10 ? 2 : 1;
        const lightMat = new THREE.MeshBasicMaterial({
          color: lightColors[colorIdx],
          transparent: true,
          opacity: 0.9,
        });
        const light = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 6, 6),
          lightMat
        );
        light.position.set(edgeX, 0.3, this.runwayZ + d);
        this.scene.add(light);

        // Light post
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 0.3, 4),
          new THREE.MeshPhongMaterial({ color: 0x666666 })
        );
        post.position.set(edgeX, 0.15, this.runwayZ + d);
        this.scene.add(post);
      }
    }

    // --- Approach lights (PAPI-style) ---
    for (let i = 1; i <= 6; i++) {
      for (const side of [-1, 1]) {
        const appLight = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 6, 6),
          new THREE.MeshBasicMaterial({ color: i <= 3 ? 0xff4400 : 0xffffff })
        );
        appLight.position.set(
          this.runwayX + side * (1 + i * 0.8),
          0.2,
          this.runwayZ - this.runwayLength / 2 - 2 - i * 2
        );
        this.scene.add(appLight);
      }
    }

    // --- Terminal building ---
    const terminalMat = new THREE.MeshPhongMaterial({ color: 0x334455, shininess: 60 });
    const terminal = new THREE.Mesh(
      new THREE.BoxGeometry(20, 6, 8),
      terminalMat
    );
    terminal.position.set(this.runwayX + 18, 3, this.runwayZ);
    this.scene.add(terminal);

    // Terminal windows
    const windowMat = new THREE.MeshBasicMaterial({ color: 0xffeebb, transparent: true, opacity: 0.7 });
    for (let w = -8; w <= 8; w += 2) {
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 2.5),
        windowMat
      );
      win.position.set(this.runwayX + 18 - 4.01, 3.5, this.runwayZ + w);
      win.rotation.y = Math.PI / 2;
      this.scene.add(win);
    }

    // Terminal roof neon strip
    const termNeon = new THREE.Mesh(
      new THREE.BoxGeometry(20.5, 0.1, 8.5),
      new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.5 })
    );
    termNeon.position.set(this.runwayX + 18, 6.05, this.runwayZ);
    this.scene.add(termNeon);

    // Control tower
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 2, 12, 8),
      new THREE.MeshPhongMaterial({ color: 0x445566, shininess: 80 })
    );
    tower.position.set(this.runwayX + 25, 6, this.runwayZ);
    this.scene.add(tower);

    // Tower cab (glass)
    const cab = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 1.8, 3, 8),
      new THREE.MeshPhongMaterial({
        color: 0x88ccff, transparent: true, opacity: 0.5,
        shininess: 120, specular: 0xffffff,
      })
    );
    cab.position.set(this.runwayX + 25, 13.5, this.runwayZ);
    this.scene.add(cab);

    // Tower light beacon
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );
    beacon.position.set(this.runwayX + 25, 15.2, this.runwayZ);
    beacon.name = 'towerBeacon';
    this.scene.add(beacon);
  }

  // Get the start position for takeoff (south end of runway, car faces north)
  getTakeoffPosition() {
    return this.startPos.clone();
  }

  // Get landing approach position
  getLandingApproachPosition() {
    // A point south of the runway at altitude
    return new THREE.Vector3(
      this.runwayX,
      15,
      this.runwayZ + this.runwayLength / 2 + 30
    );
  }

  getRunwayCenter() {
    return new THREE.Vector3(this.runwayX, 0.5, this.runwayZ);
  }

  getRunwayHeading() {
    return this.heading;
  }

  // Check if a position is on the runway
  isOnRunway(position) {
    const dx = Math.abs(position.x - this.runwayX);
    const dz = Math.abs(position.z - this.runwayZ);
    return dx < this.runwayWidth / 2 && dz < this.runwayLength / 2 && position.y < 3;
  }

  // Distance to runway center for HUD indicator
  distanceTo(position) {
    const center = this.getRunwayCenter();
    return position.distanceTo(center);
  }

  // Direction toward runway from a position
  directionTo(position) {
    const center = this.getRunwayCenter();
    return new THREE.Vector3().subVectors(center, position).normalize();
  }
}
