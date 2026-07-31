import type { Meta, StoryObj } from "@storybook/react";

function QualificationMissingStory() {
  return <button type="button">Story missing from the configured discovery root</button>;
}

const meta = {
  title: "Qualification/Missing discovery",
  component: QualificationMissingStory
} satisfies Meta<typeof QualificationMissingStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MissingFromConfiguredRoot: Story = {};
