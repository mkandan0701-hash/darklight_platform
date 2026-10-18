"use client";

import { useState } from "react";
import { Modal } from "../../../../components/ui/Modal";
import { Button } from "../../../../components/ui/Button";
import { ICON_PROPS, Plus } from "../../../../components/ui/icons";
import { ClassroomForm } from "./ClassroomForm";

export function CreateClassroomButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus {...ICON_PROPS} aria-hidden="true" />
        Create Classroom
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create classroom"
        description="Add coaches, students and a weekly schedule from the classroom's page."
      >
        <ClassroomForm onCreated={() => setOpen(false)} />
      </Modal>
    </>
  );
}
