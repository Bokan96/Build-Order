import sys
import os

# Add src to python path
sys.path.append(os.path.join(os.path.dirname(__file__), "src"))

from prismata.main import main

if __name__ == "__main__":
    main()
