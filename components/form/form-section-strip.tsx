type FormSectionStripProps = {
  title: string;
};

export function FormSectionStrip({ title }: FormSectionStripProps) {
  return (
    <div className="bg-[#172554] px-3 py-1.5 text-xs font-semibold text-white">
      {title}
    </div>
  );
}
