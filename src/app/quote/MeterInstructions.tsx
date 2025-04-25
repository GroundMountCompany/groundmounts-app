'use client';

export default function MeterInstructions() {
  return (
    <div className="bg-gray-50 rounded-lg p-6 mb-8">
      <h2 className="text-xl font-semibold mb-4">What does an electrical meter look like?</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Example Meter Images */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <img
            src="/images/meter-example-1.jpg"
            alt="Digital Electrical Meter"
            className="w-full h-48 object-cover rounded-lg mb-3"
          />
          <p className="text-sm text-gray-600">Digital Electrical Meter</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <img
            src="/images/meter-example-2.jpg"
            alt="Analog Electrical Meter"
            className="w-full h-48 object-cover rounded-lg mb-3"
          />
          <p className="text-sm text-gray-600">Analog Electrical Meter</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <img
            src="/images/meter-example-3.jpg"
            alt="Smart Electrical Meter"
            className="w-full h-48 object-cover rounded-lg mb-3"
          />
          <p className="text-sm text-gray-600">Smart Electrical Meter</p>
        </div>
      </div>
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-medium mb-2">Tips for locating your meter:</h3>
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-2">
          <li>Usually located on the exterior walls of your home</li>
          <li>Often found near the front or side of the house</li>
          <li>May be inside a metal box or covered housing</li>
          <li>Typically at eye level or slightly lower</li>
        </ul>
      </div>
    </div>
  );
} 